import type { FastifyRequest } from 'fastify';
import type { Player, Players } from './players.js';

/** Proves which player a browser is: `<id>:<secret>`. */
export const PLAYER_COOKIE = 'trayful_player';
/** Set by visiting an invite link; lets a browser join as a guest. */
export const INVITE_COOKIE = 'trayful_invite';

const YEAR = 365 * 24 * 60 * 60;

/** Headers a proxy or tunnel adds; a request carrying one came from elsewhere. */
const FORWARDED = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

/** Who is asking, as far as the server can tell. */
export interface Caller {
  /** From this computer, not through a tunnel: the host, who may do anything. */
  local: boolean;
  /** Holds a valid invite, so may join as a guest. */
  invited: boolean;
  /** The player their cookie proves, if any. */
  player?: Player;
}

export function caller(request: FastifyRequest, players: Players): Caller {
  const cookies = parseCookies(request.headers.cookie);
  const local = isLocalRequest(request);
  const [id, secret] = splitOnce(cookies[PLAYER_COOKIE] ?? '', ':');
  const player = id ? players.authenticate(id, secret) : undefined;
  return { local, invited: local || cookies[INVITE_COOKIE] === players.invite, player };
}

/** Whether a caller may see and play the tables at all. */
export function allowed(who: Caller): boolean {
  return who.local || who.invited || who.player !== undefined;
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

export function parseCookies(header: string | undefined): Record<string, string> {
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
