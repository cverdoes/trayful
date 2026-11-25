import type { FastifyReply, FastifyRequest } from 'fastify';
import { tableKey, type Player, type Players } from './players.js';

/** Proves which player a browser is: `<id>:<secret>`. Engines send it as a bearer token. */
export const PLAYER_COOKIE = 'trayful_player';
/** Set by visiting invite links: their tokens, separated by dots. Lets a browser join as a guest. */
export const INVITE_COOKIE = 'trayful_invite';
const TOKEN_SEPARATOR = '.';

declare module 'fastify' {
  interface FastifyInstance {
    /** Who counts as the host: see `Access`. */
    access: Access;
  }
}

/**
 * The access hook: how the server tells the host, who may do anything, from everyone
 * else. Locally the host is whoever asks from this computer (`localAccess`). Owner
 * mode adds a sign-in that proves the host from anywhere.
 */
export interface Access {
  /**
   * A request straight from the host's computer. It counts as the host for agents and
   * for pages served on a local address.
   */
  fromHostComputer: (request: FastifyRequest) => boolean;
  /** Signed in as the host from anywhere, such as with owner mode's secret. */
  signedIn: (request: FastifyRequest) => boolean;
  /**
   * Whether a bearer credential looks like one this hook hands out, valid or not, so it
   * is not refused as a player's secret that no longer works.
   */
  issued: (credential: string) => boolean;
  /** Answers an MCP request from someone who is not the host. */
  refuseMcp: (request: FastifyRequest, reply: FastifyReply) => FastifyReply;
}

const YEAR = 365 * 24 * 60 * 60;

/** Headers a proxy or tunnel adds; a request carrying one came from elsewhere. */
const FORWARDED = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip', 'x-real-ip'];

/** Who is asking, as far as the server can tell. */
export interface Caller {
  /**
   * The host, who may do anything: from this computer and not through a tunnel, or,
   * in owner mode, the signed-in owner.
   */
  local: boolean;
  /** Holds at least one valid invite (or is the host), so may join as a guest. */
  invited: boolean;
  /** The player their cookie proves, if any. */
  player?: Player;
  /** Tables a guest may see and play, as `project/table`: from their invites and earlier joins. */
  tables: Set<string>;
  /** Invite tokens the browser holds, still valid. */
  tokens: string[];
  /** Sent an engine's credential that proves nobody, such as one the host sent away. */
  refused: boolean;
}

export function caller(request: FastifyRequest, players: Players): Caller {
  const cookies = parseCookies(request.headers.cookie);
  const { access } = request.server;
  const signedIn = access.signedIn(request);
  const local = access.fromHostComputer(request) || signedIn;
  const credential = bearer(request);
  const [id, secret] = splitOnce(cookies[PLAYER_COOKIE] ?? credential, ':');
  const player = id ? players.authenticate(id, secret) : undefined;
  // A bad credential is never taken for the host, even from this computer. An expired
  // sign-in token is not refused here: the MCP endpoint answers it so the agent can refresh.
  const refused = credential !== '' && !player && !signedIn && !access.issued(credential);
  const tokens = inviteTokens(request).filter((t) => players.byToken(t));
  const tables = new Set([
    ...tokens.map((t) => {
      const invite = players.byToken(t)!;
      return tableKey(invite.project, invite.table);
    }),
    ...(player ? players.tablesOf(player.id) : []),
  ]);
  if (refused) return { local: false, invited: false, tables: new Set(), tokens: [], refused };
  return { local, invited: local || tables.size > 0, player, tables, tokens, refused };
}

/** Whether a caller may see and play one table: the host any, a guest those they were invited to. */
export function allowed(who: Caller, project: string, table: string): boolean {
  return who.local || who.tables.has(tableKey(project, table));
}

/** Whether a caller may see anything of a project, such as its images. */
export function allowedProject(who: Caller, project: string): boolean {
  return who.local || [...who.tables].some((key) => key.startsWith(`${project}/`));
}

/**
 * The credential an engine sends instead of a cookie: `Authorization: Bearer <id>:<secret>`,
 * with the id and secret it got when the host let it in.
 */
export function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
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
 * The access of a Trayful on someone's own computer: the host is whoever asks from it.
 * `hostAddresses` are other addresses whose requests come from this computer, such as
 * a container's gateway.
 */
export function localAccess(hostAddresses: Iterable<string> = []): Access {
  const here = new Set(hostAddresses);
  return {
    fromHostComputer: (request) => isFromHere(request, here),
    signedIn: () => false,
    issued: () => false,
    refuseMcp: (_request, reply) =>
      reply.code(403).send({ error: 'MCP is only available from this computer.' }),
  };
}

/**
 * A request straight from this computer: a loopback address (or, in a container, the
 * address the computer reaches it from), no proxy headers, and addressed to a loopback
 * name. The last check stops a website that points its own domain at 127.0.0.1 (DNS
 * rebinding) from passing as the host.
 */
function isFromHere(request: FastifyRequest, hostAddresses: ReadonlySet<string>): boolean {
  const address = (request.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  const fromHere = address === '127.0.0.1' || address === '::1' || hostAddresses.has(address);
  return (
    fromHere &&
    isLocalOrigin(`http://${request.headers.host ?? 'localhost'}`) &&
    !FORWARDED.some((header) => request.headers[header] !== undefined)
  );
}

/** A request straight from the host's computer, as the server's access hook decides. */
export function isLocalRequest(request: FastifyRequest): boolean {
  return request.server.access.fromHostComputer(request);
}

/**
 * The host asking: from this computer, in a page served here or from an agent, or
 * signed in as the host, such as in owner mode. A signed-in host's page is on the
 * server's public address, and the guards already turn away changes from other websites.
 */
export function isHostRequest(request: FastifyRequest): boolean {
  const { access } = request.server;
  return (
    (access.fromHostComputer(request) && isLocalOrigin(request.headers.origin)) ||
    access.signedIn(request)
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
