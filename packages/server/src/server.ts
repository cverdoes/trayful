import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { isLocalOrigin } from './access.js';
import { routeContext, type TableQuery } from './routes/context.js';
import { registerAuthoringRoutes } from './routes/authoring.js';
import { registerFileRoutes } from './routes/files.js';
import { registerGuards } from './routes/guards.js';
import { registerMcp } from './routes/mcp.js';
import { registerPlayerRoutes } from './routes/players.js';
import { registerSocket } from './routes/socket.js';
import { registerTableRoutes } from './routes/tables.js';
import type { TableSession } from './session.js';
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
  /** Invite links to one table (default: the active one): open one to join it as a guest. */
  inviteLinks(query?: TableQuery): Promise<string[]>;
  close(): Promise<void>;
}

export { isLocalOrigin };

export function defaultAppDir(): string {
  return fileURLToPath(new URL('../../app/dist', import.meta.url));
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
  const app = Fastify({ logger: options.logger ?? false });
  await app.register(fastifyWebsocket);

  const ctx = routeContext(app, workspace);
  registerGuards(ctx);
  registerPlayerRoutes(ctx);
  registerTableRoutes(ctx);
  registerAuthoringRoutes(ctx);
  await registerFileRoutes(ctx, options.appDir ?? defaultAppDir());
  registerSocket(ctx);
  registerMcp(ctx);

  const address = await app.listen({
    port: options.port ?? DEFAULT_PORT,
    host: options.host ?? '127.0.0.1',
  });
  // Listening on every interface, the table is still at localhost for the host.
  ctx.url = address.replace(/\/\/(0\.0\.0\.0|\[::\])(?=:)/, '//localhost');

  const port = new URL(address).port;
  if (options.host === '0.0.0.0' || options.host === '::') {
    for (const ip of lanAddresses()) ctx.shareBases.push(`http://${ip}:${port}`);
  }

  return {
    url: ctx.url,
    workspace,
    get session() {
      return workspace.active;
    },
    app,
    shareBases: ctx.shareBases,
    addShareBase(base: string) {
      ctx.shareBases.unshift(withoutTrailingSlashes(base));
    },
    async inviteLinks(query: TableQuery = {}) {
      const { project, table } = ctx.target(query);
      return ctx.linksFor(await workspace.players.invite(project, table));
    },
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
    .filter((a): a is os.NetworkInterfaceInfo => a?.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

function withoutTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}
