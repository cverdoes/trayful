import type { FastifyRequest } from 'fastify';
import { tableKey, type Player, type Players } from './players.js';

/** Proves which player a browser is: `<id>:<secret>`. */
export const PLAYER_COOKIE = 'trayful_player';
/** Set by visiting invite links: their tokens, separated by dots. Lets a browser join as a guest. */
export const INVITE_COOKIE = 'trayful_invite';
const TOKEN_SEPARATOR = '.';

const YEAR = 365 * 24 * 60 * 60;

/** Headers a proxy or tunnel adds; a request carrying one came from elsewhere. */
const FORWARDED = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

/** Who is asking, as far as the server can tell. */
export interface Caller {
  /** From this computer, not through a tunnel: the host, who may do anything. */
  local: boolean;
  /** Holds at least one valid invite (or is the host), so may join as a guest. */
  invited: boolean;
  /** The player their cookie proves, if any. */
  player?: Player;
  /** Tables a guest may see and play, as `project/table`: from their invites and earlier joins. */
  tables: Set<string>;
  /** Invite tokens the browser holds, still valid. */
  tokens: string[];
}

export function caller(request: FastifyRequest, players: Players): Caller {
  const cookies = parseCookies(request.headers.cookie);
  const local = isLocalRequest(request);
  const [id, secret] = splitOnce(cookies[PLAYER_COOKIE] ?? '', ':');
  const player = id ? players.authenticate(id, secret) : undefined;
  const tokens = inviteTokens(request).filter((t) => players.byToken(t));
  const tables = new Set([
    ...tokens.map((t) => {
      const invite = players.byToken(t)!;
      return tableKey(invite.project, invite.table);
    }),
    ...(player ? players.tablesOf(player.id) : []),
  ]);
  return { local, invited: local || tables.size > 0, player, tables, tokens };
}

/** Whether a caller may see and play one table: the host any, a guest those they were invited to. */
export function allowed(who: Caller, project: string, table: string): boolean {
  return who.local || who.tables.has(tableKey(project, table));
}

/** Whether a caller may see anything of a project, such as its images. */
export function allowedProject(who: Caller, project: string): boolean {
  return who.local || [...who.tables].some((key) => key.startsWith(`${project}/`));
}

/** The invite tokens in a request's cookie. */
function inviteTokens(request: FastifyRequest): string[] {
  const value = parseCookies(request.headers.cookie)[INVITE_COOKIE] ?? '';
  return value.split(TOKEN_SEPARATOR).filter(Boolean);
}

/** The invite cookie value with one more token, keeping the ones still valid. */
export function addToken(tokens: string[], token: string): string {
  return [...new Set([...tokens, token])].join(TOKEN_SEPARATOR);
}

/**
 * A request straight from this computer: a loopback address, no proxy headers, and
 * addressed to a loopback name. The last check stops a website that points its own
 * domain at 127.0.0.1 (DNS rebinding) from passing as the host.
 */
export function isLocalRequest(request: FastifyRequest): boolean {
  const address = request.socket.remoteAddress ?? '';
  const loopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
  return (
    loopback &&
    isLocalOrigin(`http://${request.headers.host ?? 'localhost'}`) &&
    !FORWARDED.some((header) => request.headers[header] !== undefined)
  );
}

export function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Non-browser clients such as tests and agents.
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Whether a browser request comes from a Trayful page rather than another website:
 * a page on this computer, or one served by this server under the address the
 * guest used (the host header, the address a tunnel forwarded, or a shared address).
 */
export function isTrustedOrigin(request: FastifyRequest, shared: readonly string[] = []): boolean {
  const origin = request.headers.origin;
  if (isLocalOrigin(origin)) return true;
  if (isLocalRequest(request)) return false;
  let host: string;
  try {
    host = new URL(origin!).host;
  } catch {
    return false;
  }
  const forwarded = request.headers['x-forwarded-host'];
  return (
    host === request.headers.host ||
    (typeof forwarded === 'string' && host === forwarded) ||
    shared.some((base) => new URL(base).host === host)
  );
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const [name, value] = splitOnce(part.trim(), '=');
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/** A `set-cookie` value for a long-lived, script-proof cookie. */
export function cookie(name: string, value: string, request: FastifyRequest): string {
  const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${secure}`;
}

function splitOnce(text: string, separator: string): [string, string] {
  const at = text.indexOf(separator);
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)];
}
