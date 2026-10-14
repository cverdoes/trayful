import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SetupError, type ClientMessage, type ServerMessage } from '@trayful/core';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  allowed,
  caller,
  cookie,
  INVITE_COOKIE,
  isLocalOrigin,
  isLocalRequest,
  isTrustedOrigin,
  PLAYER_COOKIE,
} from './access.js';
import { createMcpServer } from './mcp.js';
import { PlayerError, type Player } from './players.js';
import { ProjectLoadError, type TableSession } from './session.js';
import { Workspace } from './workspace.js';

export const DEFAULT_PORT = 4317;

export interface ServerOptions {
  /** A project folder, or a folder whose sub-folders are projects. */
  projectDir: string;
  /** In a folder of projects: the one to open first. Default: the first that loads. */
  project?: string;
  /** Table name; its state lives in `tables/<table>.json`. Default `table-1`. */
  table?: string;
  /** Port to listen on. Default 4317; 0 picks a free port. */
  port?: number;
  /**
   * Interface to bind. Default `127.0.0.1`, so the table is only reachable from this
   * computer (and through a tunnel). `0.0.0.0` lets others on the network join.
   */
  host?: string;
  /** Folder with the built browser app. Default: `packages/app/dist` in this repository. */
  appDir?: string;
  /** Seed for a newly created table. */
  seed?: number;
  /** Setup for a newly created table. Default: the manifest's `setup`; `false` for none. */
  setup?: string | false;
  /** Reload projects when their files change. Default true. */
  watch?: boolean;
  logger?: boolean;
}

export interface RunningServer {
  url: string;
  workspace: Workspace;
  /** The table agents play on: the one opened at start, until an agent opens another. */
  readonly session: TableSession;
  app: FastifyInstance;
  /** Addresses others can reach this server at, for invite links. */
  readonly shareBases: string[];
  /** Adds an address others can reach this server at, such as a tunnel's. */
  addShareBase(url: string): void;
  /** Invite links: open one to join the tables as a guest. */
  inviteLinks(query?: TableQuery): string[];
  close(): Promise<void>;
}

export { isLocalOrigin };

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export function defaultAppDir(): string {
  return fileURLToPath(new URL('../../app/dist', import.meta.url));
}

interface TableQuery {
  project?: string;
  table?: string;
}

/** Starts the local Trayful server for a project, or a folder of projects. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const workspace = await Workspace.open(options.projectDir, {
    project: options.project,
    table: options.table,
    seed: options.seed,
    setup: options.setup,
    watch: options.watch,
  });
  const appDir = options.appDir ?? defaultAppDir();
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(fastifyWebsocket);

  /** The table a request names, or the one agents are playing on. */
  const sessionFor = (query: TableQuery) =>
    query.project || query.table
      ? workspace.table(query.project ?? workspace.active.projectId, query.table ?? 'table-1')
      : Promise.resolve(workspace.active);

  app.setErrorHandler((err: Error, _request, reply) => {
    const known =
      err instanceof ProjectLoadError || err instanceof SetupError || err instanceof PlayerError;
    void reply.code(known ? 400 : 500).send({ error: err.message });
  });

  const { players } = workspace;
  /** Who a request is from. Requests from this computer without a cookie are the host. */
  const identify = async (request: FastifyRequest) => {
    const who = caller(request, players);
    const player: Player | undefined = who.player ?? (who.local ? await players.host() : undefined);
    return { who, player };
  };

  // Tables, images and the socket are for the host and invited guests only. The page
  // itself is not secret; without an invite it shows how to get one.
  const open = new Set(['/api/me', '/api/join', '/api/health']);
  app.addHook('onRequest', async (request, reply) => {
    const route = request.url.split('?')[0]!;
    const guarded =
      (route.startsWith('/api/') && !open.has(route)) ||
      route.startsWith('/project-files/') ||
      route === '/ws';
    if (guarded && !allowed(caller(request, players))) {
      return reply.code(403).send({ error: 'Ask the host for an invite link to join this table.' });
    }
    // Changes must come from a Trayful page, not from another website open in the browser.
    if (request.method !== 'GET' && route !== '/mcp' && !isTrustedOrigin(request)) {
      return reply.code(403).send({ error: 'Origin not allowed' });
    }
  });
  /** Only the person at this computer may change which tables exist, or author. */
  const hostOnly = (request: FastifyRequest, reply: FastifyReply) => {
    if (isLocalRequest(request) && isLocalOrigin(request.headers.origin)) return false;
    void reply.code(403).send({ error: 'Only the host can do that.' });
    return true;
  };

  app.get('/api/health', async (request) => ({
    ok: true,
    project: workspace.active.project.manifest.name,
    table: workspace.active.tableName,
    ...(isLocalRequest(request)
      ? { projectDir: workspace.active.project.dir, root: workspace.root }
      : {}),
  }));

  app.get('/api/me', async (request) => {
    const { who, player } = await identify(request);
    return { player, host: who.local, invited: who.invited, joined: who.player !== undefined };
  });
  app.post<{ Body: { name?: string } }>('/api/me', async (request, reply) => {
    const { player } = await identify(request);
    if (!player) return reply.code(403).send({ error: 'Join the table first.' });
    return { player: await workspace.renamePlayer(player.id, request.body?.name ?? '') };
  });
  app.post<{ Body: { name?: string } }>('/api/join', async (request, reply) => {
    const who = caller(request, players);
    if (!who.invited) {
      return reply.code(403).send({ error: 'Ask the host for an invite link to join this table.' });
    }
    if (who.player)
      return { player: await workspace.renamePlayer(who.player.id, request.body?.name ?? '') };
    const { player, secret } = await players.join(
      request.body?.name ?? '',
      who.local ? 'host' : 'guest',
    );
    void reply.header('set-cookie', cookie(PLAYER_COOKIE, `${player.id}:${secret}`, request));
    return { player };
  });
  app.get<{ Params: { invite: string }; Querystring: TableQuery }>(
    '/join/:invite',
    async (request, reply) => {
      if (request.params.invite !== players.invite) {
        return reply
          .code(403)
          .type('text/plain')
          .send('This invite link is not valid any more. Ask the host for a new one.');
      }
      const query = new URLSearchParams({ join: '' });
      if (request.query.project) query.set('project', request.query.project);
      if (request.query.table) query.set('table', request.query.table);
      return reply
        .header('set-cookie', cookie(INVITE_COOKIE, players.invite, request))
        .redirect(`/?${query.toString().replace('join=', 'join')}`);
    },
  );
  app.get<{ Querystring: TableQuery }>('/api/share', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return { links: inviteLinks(request.query), bound: options.host ?? '127.0.0.1' };
  });
  app.get('/api/projects', async () =>
    Promise.all(
      workspace.projects().map(async (entry) => ({
        id: entry.id,
        name: entry.project?.manifest.name ?? entry.id,
        problems: entry.problems,
        tables: entry.project ? await workspace.tables(entry.id) : [],
      })),
    ),
  );
  app.get<{ Querystring: TableQuery }>('/api/project', async (request) =>
    (await sessionFor(request.query)).view(),
  );
  app.get<{ Querystring: TableQuery }>('/api/table', async (request) => {
    const { player } = await identify(request);
    return (await sessionFor(request.query)).viewFor(player?.id);
  });
  // Every component with its text, for print-and-play: the host's view only.
  app.get<{ Querystring: { project?: string } }>('/api/components', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return workspace.project(request.query.project).components;
  });

  // New, duplicated and deleted tables, for the table menu in the browser.
  app.post<{
    Body: { project?: string; name: string; from?: string; setup?: string | false };
  }>('/api/tables', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { project = workspace.active.projectId, name, from, setup } = request.body ?? {};
    if (!name) return reply.code(400).send({ error: 'Give the new table a name.' });
    if ((await workspace.tables(project)).includes(name)) {
      return reply.code(400).send({ error: `There is already a table "${name}".` });
    }
    const session = from
      ? await workspace.duplicateTable(project, from, name)
      : await workspace.table(project, name, { setup });
    return { project: session.projectId, table: session.tableName };
  });
  app.delete<{ Querystring: { project?: string; name: string } }>(
    '/api/tables',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      await workspace.deleteTable(
        request.query.project ?? workspace.active.projectId,
        request.query.name,
      );
      return { ok: true };
    },
  );

  // Images referenced by a project's libraries, served from its folder.
  app.get<{ Params: { project: string; '*': string } }>(
    '/project-files/:project/*',
    async (request, reply) => {
      const entry = workspace.entry(request.params.project);
      const file = path.resolve(entry.dir, request.params['*']);
      const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
      if (
        !type ||
        !file.startsWith(entry.dir + path.sep) ||
        file.includes(`${path.sep}tables${path.sep}`)
      ) {
        return reply.code(404).send({ error: 'Not found' });
      }
      try {
        return reply
          .type(type)
          .header('cache-control', 'no-cache')
          .send(await readFile(file));
      } catch {
        return reply.code(404).send({ error: 'Not found' });
      }
    },
  );

  if (existsSync(path.join(appDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: appDir, prefix: '/', decorateReply: false });
  } else {
    app.get('/', async (_req, reply) =>
      reply
        .code(503)
        .type('text/plain')
        .send(
          'The Trayful browser app has not been built yet. Run `pnpm build` in the repository, then restart.',
        ),
    );
  }

  app.get<{ Querystring: TableQuery }>('/ws', { websocket: true }, (socket, request) => {
    // Only Trayful pages may drive the table; this stops other websites open in the
    // browser from connecting to the server.
    if (!isTrustedOrigin(request)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    Promise.all([sessionFor(request.query), identify(request)]).then(
      ([session, { player }]) => {
        const viewer = player?.id;
        send(session.stateMessage(viewer));
        const problems = workspace.entry(session.projectId).problems;
        if (problems.length) send({ type: 'problems', problems });
        const unsubscribe = session.subscribe(send, viewer);
        socket.on('message', (data) => {
          let message: ClientMessage;
          try {
            message = JSON.parse(String(data)) as ClientMessage;
          } catch {
            send({ type: 'error', message: 'Messages must be JSON.' });
            return;
          }
          // Watching needs only an invite; playing needs a name.
          if (!viewer && message?.type !== 'snapshot') {
            send({ type: 'error', message: 'Join the table to play.' });
            return;
          }
          const error = session.handle(message, viewer);
          if (error) send(error);
        });
        socket.on('close', unsubscribe);
      },
      (err: Error) => {
        send({ type: 'error', message: err.message });
        socket.close(1008, 'No such table');
      },
    );
  });

  // MCP over Streamable HTTP, stateless: each request gets its own server object,
  // all sharing the one workspace.
  let url = '';
  app.post('/mcp', async (request, reply) => {
    // Agents run on the host's computer; MCP is never offered through a tunnel or the network.
    if (!isLocalRequest(request) || !isLocalOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: 'MCP is only available from this computer.' });
    }
    const mcp = createMcpServer(workspace, { url });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
  const notAllowed = async (_req: unknown, reply: FastifyReply) =>
    reply.code(405).header('allow', 'POST').send({ error: 'Use POST for MCP requests.' });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  const address = await app.listen({
    port: options.port ?? DEFAULT_PORT,
    host: options.host ?? '127.0.0.1',
  });
  url = address;

  const shareBases: string[] = [];
  const port = new URL(address).port;
  if (options.host === '0.0.0.0' || options.host === '::') {
    for (const ip of lanAddresses()) shareBases.push(`http://${ip}:${port}`);
  }
  function inviteLinks(query: TableQuery = {}): string[] {
    const params = new URLSearchParams();
    if (query.project) params.set('project', query.project);
    if (query.table) params.set('table', query.table);
    const suffix = params.size ? `?${params}` : '';
    return shareBases.map((base) => `${base}/join/${players.invite}${suffix}`);
  }

  return {
    url,
    workspace,
    get session() {
      return workspace.active;
    },
    app,
    shareBases,
    addShareBase(base: string) {
      shareBases.unshift(base.replace(/\/+$/, ''));
    },
    inviteLinks,
    async close() {
      await app.close();
      await workspace.close();
    },
  };
}

/** This computer's addresses on the local network, for invite links. */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
}
