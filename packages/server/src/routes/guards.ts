import { SetupError } from '@trayful/core';
import { allowed, allowedProject, caller, isTrustedOrigin } from '../access.js';
import { PlayerError } from '../players.js';
import { ProjectLoadError } from '../session.js';
import { NOT_INVITED, type RouteContext, type TableQuery } from './context.js';

/** API routes anyone may call, invited or not. */
const OPEN = new Set(['/api/me', '/api/join', '/api/health']);

/**
 * Error replies, and who may reach which route, checked before any route runs. A table,
 * its images and its socket are for the host and the guests invited to it. The page
 * itself is not secret; without an invite it shows how to get one.
 */
export function registerGuards({ app, players, shareBases, target }: RouteContext): void {
  app.setErrorHandler((err: Error, _request, reply) => {
    const known =
      err instanceof ProjectLoadError || err instanceof SetupError || err instanceof PlayerError;
    void reply.code(known ? 400 : 500).send({ error: err.message });
  });

  app.addHook('onRequest', async (request, reply) => {
    const route = request.url.split('?')[0]!;
    // Changes must come from a Trayful page, not from another website open in the browser.
    if (request.method !== 'GET' && route !== '/mcp' && !isTrustedOrigin(request, shareBases)) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
  });
  app.addHook('preHandler', async (request, reply) => {
    const route = request.url.split('?')[0]!;
    const who = caller(request, players);
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
