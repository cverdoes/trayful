import { SetupError } from '@trayful/core';
import { allowed, allowedProject, caller, isTrustedOrigin } from '../play/access.js';
import { GitError } from '../git/git.js';
import { FreshError } from '../git/repository.js';
import { AuthoringError, ConflictError } from '../projects/authoring.js';
import { PlayerError } from '../play/players.js';
import { ProjectLoadError } from '../play/session.js';
import { WEBHOOK_ROUTE } from './repository.js';
import { NOT_INVITED, type RouteContext, type TableQuery } from './context.js';

/** API routes anyone may call, invited or not. Knocking asks the host, who decides. */
const OPEN = new Set(['/api/me', '/api/join', '/api/health', '/api/knock', WEBHOOK_ROUTE]);

/**
 * Routes agents call with a token rather than a browser's cookies, and the webhook
 * that proves itself with a signature, so a request from another website gains
 * nothing a request from anywhere else would not.
 */
const TOKEN_ONLY = new Set(['/mcp', '/oauth/register', '/oauth/token', WEBHOOK_ROUTE]);

/**
 * Error replies, and who may reach which route, checked before any route runs. A table,
 * its images and its socket are for the host and the guests invited to it. The page
 * itself is not secret; without an invite it shows how to get one.
 */
export function registerGuards({ app, players, shareBases, target }: RouteContext): void {
  app.setErrorHandler((err: Error, _request, reply) => {
    // A new branch or project to confirm says which, so the page can ask about each.
    const fresh = err instanceof FreshError ? { fresh: err.fresh } : {};
    void reply.code(statusFor(err)).send({ error: err.message, ...fresh });
  });

  app.addHook('onRequest', async (request, reply) => {
    const route = request.url.split('?')[0]!;
    // Changes must come from a Trayful page, not from another website open in the browser.
    if (
      request.method !== 'GET' &&
      !TOKEN_ONLY.has(route) &&
      !isTrustedOrigin(request, shareBases)
    ) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
  });
  app.addHook('preHandler', async (request, reply) => {
    const route = request.url.split('?')[0]!;
    const who = caller(request, players);
    if (who.refused) {
      return reply
        .code(403)
        .send({ error: 'That secret lets nobody in any more. Knock to be let in again.' });
    }
    let ok = true;
    if (route === '/api/project' || route === '/api/table' || route === '/ws') {
      const { project, table } = target(request.query as TableQuery);
      ok = allowed(who, project, table);
    } else if (route.startsWith('/project-files/')) {
      ok = allowedProject(who, (request.params as { project: string }).project);
    } else if (route.startsWith('/api/') && !OPEN.has(route)) {
      ok = who.invited;
    }
    if (!ok) return reply.code(403).send({ error: NOT_INVITED });
  });
}

/** The HTTP status for an error a route threw: the caller's mistake, a conflict, or ours. */
function statusFor(err: Error): number {
  if (err instanceof ConflictError) return 409;
  const known =
    err instanceof ProjectLoadError ||
    err instanceof SetupError ||
    err instanceof PlayerError ||
    err instanceof AuthoringError ||
    err instanceof GitError;
  return known ? 400 : 500;
}
