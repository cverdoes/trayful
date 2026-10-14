import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SetupError, type ClientMessage, type ServerMessage } from '@trayful/core';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { createMcpServer } from './mcp.js';
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
  /** Interface to bind. Default `127.0.0.1`, so the table is only reachable from this computer. */
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
  close(): Promise<void>;
}

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
    const known = err instanceof ProjectLoadError || err instanceof SetupError;
    void reply.code(known ? 400 : 500).send({ error: err.message });
  });

  app.get('/api/health', async () => ({
    ok: true,
    project: workspace.active.project.manifest.name,
    projectDir: workspace.active.project.dir,
    root: workspace.root,
    table: workspace.active.tableName,
  }));
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
  app.get<{ Querystring: TableQuery }>(
    '/api/table',
    async (request) => (await sessionFor(request.query)).engine.state,
  );
  app.get<{ Querystring: { project?: string } }>(
    '/api/components',
    async (request) => workspace.project(request.query.project).components,
  );

  // New, duplicated and deleted tables, for the table menu in the browser.
  app.post<{
    Body: { project?: string; name: string; from?: string; setup?: string | false };
  }>('/api/tables', async (request, reply) => {
    if (!isLocalOrigin(request.headers.origin))
      return reply.code(403).send({ error: 'Origin not allowed' });
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
      if (!isLocalOrigin(request.headers.origin))
        return reply.code(403).send({ error: 'Origin not allowed' });
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
    // Only pages served from this computer may drive the table; this stops other
    // websites open in the browser from connecting to the local server.
    if (!isLocalOrigin(request.headers.origin)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    sessionFor(request.query).then(
      (session) => {
        send(session.stateMessage());
        const problems = workspace.entry(session.projectId).problems;
        if (problems.length) send({ type: 'problems', problems });
        const unsubscribe = session.subscribe(send);
        socket.on('message', (data) => {
          let message: ClientMessage;
          try {
            message = JSON.parse(String(data)) as ClientMessage;
          } catch {
            send({ type: 'error', message: 'Messages must be JSON.' });
            return;
          }
          const error = session.handle(message);
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
    if (!isLocalOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: 'Origin not allowed' });
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

  return {
    url,
    workspace,
    get session() {
      return workspace.active;
    },
    app,
    async close() {
      await app.close();
      await workspace.close();
    },
  };
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
