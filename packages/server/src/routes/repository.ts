import type { GitLink } from '../git/link.js';
import { GitError } from '../git/git.js';
import type { RouteContext } from './context.js';

interface ConnectBody {
  url?: string;
  branch?: string;
  path?: string;
  create?: boolean;
}

/**
 * The repository of a git-backed Trayful, for the host's page: where things stand,
 * connecting, syncing and resolving a conflict.
 */
export function registerRepositoryRoutes(ctx: RouteContext, link: GitLink): void {
  const { app, hostOnly } = ctx;

  app.get('/api/repository', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return link.status();
  });

  app.post<{ Body: ConnectBody | null }>('/api/repository/connect', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { url, branch, path, create } = request.body ?? {};
    if (!url) throw new GitError('Give the address of the repository.');
    return link.connect({ url, branch, path, create: create === true });
  });

  app.post<{ Body: { message?: string } | null }>(
    '/api/repository/sync',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      await link.sync(request.body?.message);
      return link.status();
    },
  );

  app.post('/api/repository/resolve', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    await link.repository.takeTheirs();
    return link.status();
  });
}
