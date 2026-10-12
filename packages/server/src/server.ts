import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { ClientMessage, ServerMessage } from '@trayful/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { TableSession } from './session.js';

export const DEFAULT_PORT = 4317;

export interface ServerOptions {
  projectDir: string;
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
  logger?: boolean;
}

export interface RunningServer {
  url: string;
  session: TableSession;
  app: FastifyInstance;
  close(): Promise<void>;
}

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)$/i;

export function defaultAppDir(): string {
  return fileURLToPath(new URL('../../app/dist', import.meta.url));
}

/** Starts the local Trayful server for one project table. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const session = await TableSession.open(options.projectDir, options.table, {
    seed: options.seed,
  });
  const appDir = options.appDir ?? defaultAppDir();
  const app = Fastify({ logger: options.logger ?? false });

  await app.register(fastifyWebsocket);

  app.get('/api/health', async () => ({
    ok: true,
    project: session.project.manifest.name,
    table: session.tableName,
  }));
  app.get('/api/project', async () => session.view());
  app.get('/api/table', async () => session.engine.state);

  // Images referenced by the project's libraries, served from the project folder.
  await app.register(fastifyStatic, {
    root: session.project.dir,
    prefix: '/project-files/',
    decorateReply: false,
    allowedPath: (pathName) => IMAGE_FILE.test(pathName),
  });

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

  app.get('/ws', { websocket: true }, (socket, request) => {
    // Only pages served from this computer may drive the table; this stops other
    // websites open in the browser from connecting to the local server.
    if (!isLocalOrigin(request.headers.origin)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    send(session.stateMessage());
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
  });

  const address = await app.listen({
    port: options.port ?? DEFAULT_PORT,
    host: options.host ?? '127.0.0.1',
  });
  const url = address;

  return {
    url,
    session,
    app,
    async close() {
      await app.close();
      await session.close();
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
