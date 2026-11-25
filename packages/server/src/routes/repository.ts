import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GitLink } from '../git/link.js';
import { GitError } from '../git/git.js';
import type { RouteContext } from './context.js';

interface ConnectBody {
  url?: string;
  branch?: string;
  path?: string;
  create?: boolean;
}

/** Where GitHub sends its push events; see `registerWebhook`. */
export const WEBHOOK_ROUTE = '/api/repository/hook';

/** The routes that change project files, and what to call them in a commit message. */
const EDITING_ROUTES: [prefix: string, name: string][] = [
  ['/api/types', 'designer'],
  ['/api/tray', 'Tray'],
  ['/api/assets', 'assets'],
  ['/api/migrate', 'migrate'],
  ['/api/projects', 'new project'],
];

/**
 * The repository of a git-backed Trayful, for the host's page: where things stand,
 * connecting, syncing and resolving a conflict; and a webhook for pushes.
 */
export function registerRepositoryRoutes(ctx: RouteContext): void {
  const { app } = ctx;
  const linkFor = hostsLink(ctx);

  app.get('/api/repository', async (request, reply) => {
    const link = linkFor(request, reply);
    if (!link) return;
    return link.status();
  });

  app.post<{ Body: ConnectBody | null }>('/api/repository/connect', async (request, reply) => {
    const link = linkFor(request, reply);
    if (!link) return;
    const { url, branch, path, create } = request.body ?? {};
    if (!url) throw new GitError('Give the address of the repository.');
    return link.connect({ url, branch, path, create: create === true });
  });

  app.post<{ Body: { message?: string } | null }>(
    '/api/repository/sync',
    async (request, reply) => {
      const link = linkFor(request, reply);
      if (!link) return;
      await link.sync(request.body?.message);
      return link.status();
    },
  );

  app.get('/api/repository/branches', async (request, reply) => {
    const link = linkFor(request, reply);
    if (!link) return;
    return { branches: await link.repository.branches() };
  });

  app.post<{ Body: { name?: string; create?: boolean } | null }>(
    '/api/repository/branch',
    async (request, reply) => {
      const link = linkFor(request, reply);
      if (!link) return;
      const { name, create } = request.body ?? {};
      if (!name) throw new GitError('Give the name of the branch.');
      if (create) await link.repository.createBranch(name);
      else await link.repository.switchBranch(name);
      return link.status();
    },
  );

  app.post<{ Body: { message?: string } | null }>(
    '/api/repository/snapshot',
    async (request, reply) => {
      const link = linkFor(request, reply);
      if (!link) return;
      await link.snapshotTables(request.body?.message);
      return link.status();
    },
  );

  app.post('/api/repository/resolve', async (request, reply) => {
    const link = linkFor(request, reply);
    if (!link) return;
    await link.repository.takeTheirs();
    return link.status();
  });

  noteEdits(ctx);
  void app.register((scope, _options, done) => {
    registerWebhook(scope, ctx);
    done();
  });
}

/**
 * The repository of the request's space, for the host. Replies 404 when the space works
 * on a folder, as the page expects, and 403 to anyone but the host.
 */
function hostsLink({ spaceOf, hostOnly }: RouteContext) {
  return (request: FastifyRequest, reply: FastifyReply): GitLink | undefined => {
    const { git } = spaceOf(request);
    if (!git) {
      void reply.code(404).send({ error: 'This Trayful works on a folder, not a repository.' });
      return undefined;
    }
    return hostOnly(request, reply) ? undefined : git;
  };
}

/** Puts each change made in the designer, the Tray or the assets in the journal, by who made it. */
function noteEdits({ app, spaceOf, identify }: RouteContext): void {
  // Before the answer goes out, so a sync asked for right after it has the note.
  app.addHook('onSend', async (request, reply, payload) => {
    const area = EDITING_ROUTES.find(([prefix]) => request.url.startsWith(prefix))?.[1];
    const link = spaceOf(request).git;
    if (link && area && request.method !== 'GET' && reply.statusCode < 400) {
      const { player } = await identify(request);
      link.journal.note(player?.name ?? 'host', area);
    }
    return payload;
  });
}

/**
 * A push webhook, such as GitHub's: a push to the branch makes Trayful sync at once
 * instead of at its next fetch. GitHub signs each event with the webhook's secret,
 * TRAYFUL_GIT_WEBHOOK_SECRET; without one set, the route says so and does nothing.
 */
function registerWebhook(scope: FastifyInstance, { spaceOf }: RouteContext): void {
  // The signature is of the bytes as sent, so this route reads them before any parsing.
  scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );
  scope.post<{ Body: Buffer }>(WEBHOOK_ROUTE, async (request, reply) => {
    const link = spaceOf(request).git;
    const secret = link?.repository.webhookSecret;
    if (!link || !secret) {
      return reply
        .code(404)
        .send({ error: 'No webhook here: start Trayful with TRAYFUL_GIT_WEBHOOK_SECRET.' });
    }
    const signature = request.headers['x-hub-signature-256'];
    if (typeof signature !== 'string' || !signedBy(secret, request.body, signature)) {
      return reply.code(401).send({ error: 'The signature does not match the webhook secret.' });
    }
    if (pushedTo(request.body) === `refs/heads/${link.repository.settings?.branch ?? ''}`) {
      // GitHub waits ten seconds at most; the sync goes on after the answer.
      link.sync().catch(() => undefined);
    }
    return reply.code(202).send({ ok: true });
  });
}

function signedBy(secret: string, body: Buffer, signature: string): boolean {
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The ref a push event is for, such as `refs/heads/main`; undefined for other events. */
function pushedTo(body: Buffer): string | undefined {
  try {
    const event = JSON.parse(body.toString('utf8')) as { ref?: unknown };
    return typeof event.ref === 'string' ? event.ref : undefined;
  } catch {
    return undefined;
  }
}
