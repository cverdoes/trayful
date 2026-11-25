import type { FastifyInstance } from 'fastify';
import type { Access } from './play/access.js';

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
  const deciding = extensions.filter((e) => e.access);
  if (deciding.length > 1) {
    throw new Error('Only one extension may decide who counts as the host.');
  }
  return deciding[0]?.access?.(local) ?? local;
}
