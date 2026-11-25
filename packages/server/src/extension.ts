import type { FastifyInstance } from 'fastify';
import type { Access } from './play/access.js';
import { noLimits, type Limits } from './play/limits.js';
import type { Space, SpaceResolver } from './space.js';

/**
 * Adds to the server without changing its core, such as owner mode for a Trayful on a
 * server somewhere. Every part is optional; a server with no extensions is a Trayful on
 * someone's own computer.
 */
export interface Extension {
  /**
   * Decides who counts as the host, starting from the access of a Trayful on someone's
   * own computer. At most one extension may bring one.
   */
  access?: (local: Access) => Access;
  /**
   * Finds the space each request is for, such as one per tenant, given the space the
   * server was started on. At most one extension may bring one. Without it, every
   * request is for the server's own space.
   */
  spaces?: (own: Space) => SpaceResolver;
  /**
   * How far a space may grow, such as by the plan of whoever it belongs to. The server
   * asks before a new project, table, invite, file, repository or agent request. At
   * most one extension may bring them; without, nothing is limited.
   */
  limits?: (space: Space) => Limits;
  /**
   * Routes that agents call with a token rather than a browser's cookies, so a request
   * from another website gains nothing by reaching them. They skip the check that a
   * change comes from a Trayful page.
   */
  tokenRoutes?: readonly string[];
  /** Adds the extension's routes and hooks, before the server's own routes. */
  register?: (app: FastifyInstance) => void;
}

/** The access of a server with these extensions. */
export function accessWith(extensions: readonly Extension[], local: Access): Access {
  const hook = onlyOne(extensions, 'access', 'who counts as the host');
  return hook ? hook(local) : local;
}

/** How a server with these extensions finds the space of a request. */
export function spacesWith(extensions: readonly Extension[], own: Space): SpaceResolver {
  const hook = onlyOne(extensions, 'spaces', 'which space a request is for');
  return hook ? hook(own) : () => own;
}

/** The limits of a space, as the extensions set them. */
export function limitsWith(extensions: readonly Extension[], space: Space): Limits {
  const hook = onlyOne(extensions, 'limits', 'how far a space may grow');
  return hook ? hook(space) : noLimits;
}

/** The one extension's hook of a kind, if any; two that both bring one are a mistake. */
function onlyOne<K extends 'access' | 'spaces' | 'limits'>(
  extensions: readonly Extension[],
  kind: K,
  decides: string,
): Extension[K] {
  const hooks = extensions.flatMap((e) => (e[kind] ? [e[kind]] : []));
  if (hooks.length > 1) throw new Error(`Only one extension may decide ${decides}.`);
  return hooks[0];
}
