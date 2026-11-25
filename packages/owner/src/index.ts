/**
 * Owner mode, as a server extension: for a Trayful on a server somewhere, used by one
 * person. Whoever signs in with the owner secret is the host, from anywhere, and their
 * agents reach MCP with OAuth.
 */
import type { Extension } from '@trayful/server';
import { Owner } from './owner.js';
import { ownerAccess, registerOwnerRoutes } from './routes.js';

export { OwnerError } from './owner.js';

/**
 * The owner mode extension, for `startServer`'s `extensions`. The secret must be at
 * least 32 characters, or this throws an `OwnerError`.
 */
export function ownerMode(secret: string): Extension {
  const owner = new Owner(secret);
  return {
    access: (local) => ownerAccess(owner, local),
    tokenRoutes: ['/oauth/register', '/oauth/token'],
    register: (app) => registerOwnerRoutes(app, owner),
  };
}
