import os from 'node:os';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { isLocalOrigin, localAccess } from './play/access.js';
import { resourceDir } from './shipped/resources.js';
import { routeContext, targetIn, type TableQuery } from './routes/context.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerAuthoringRoutes } from './routes/authoring.js';
import { registerTrayRoutes } from './routes/tray.js';
import { registerEngineRoutes } from './routes/engines.js';
import { registerFileRoutes } from './routes/files.js';
import { registerGuards } from './routes/guards.js';
import { registerMcp } from './routes/mcp.js';
import { registerPlayerRoutes } from './routes/players.js';
import { registerSocket } from './routes/socket.js';
import { registerTableRoutes } from './routes/tables.js';
import type { TableSession } from './play/session.js';
import { Workspace } from './projects/workspace.js';
import { GitLink } from './git/link.js';
import type { Repository } from './git/repository.js';
import type { SyncTimes } from './git/autosync.js';
import { registerRepositoryRoutes } from './routes/repository.js';
import { accessWith, spacesWith, type Extension } from './extension.js';
import { openSpace } from './space.js';

export const DEFAULT_PORT = 4317;

export interface ServerOptions {
  /** A project folder, or a folder whose sub-folders are projects. Not with `repository`. */
  projectDir?: string;
  /**
   * A git-backed Trayful: the projects come from this repository's clone, and Trayful
   * commits, pulls and pushes them. If no repository is connected yet, Trayful starts
   * with no project and waits to be connected to one.
   */
  repository?: Repository;
  /**
   * With `repository`: how often Trayful commits, fetches and pushes by itself, or
   * false for only when asked. Default: commit 30 s after a change, fetch every 2
   * minutes, push every 5.
   */
  syncTimes?: SyncTimes | false;
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
  /** Running inside a container, such as with the repository's Docker setup. */
  container?: ContainerOptions;
  /**
   * Additions to the server, such as owner mode for a Trayful on a server somewhere.
   * Leave them out to run as usual, where only this computer is the host.
   */
  extensions?: readonly Extension[];
  /** Folder with the built browser app. Default: `packages/app/dist` in this repository. */
  appDir?: string;
  /** What to call the host. Default: the account running the server. */
  hostName?: string;
  /** Seed for a newly created table. */
  seed?: number;
  /** Setup for a newly created table. Default: the manifest's `setup`; `false` for none. */
  setup?: string | false;
  /** Reload projects when their files change. Default true. */
  watch?: boolean;
  /**
   * Hold each agent change until people watching have seen it play out, so a quick run
   * of agent moves shows one at a time. Default true.
   */
  agentPace?: boolean;
  logger?: boolean;
}

/**
 * Inside a container the server listens on every interface, so a published port
 * reaches it, and makes no network invite links: the container's addresses are no use
 * to anyone. Publish the port on the computer's loopback only (`127.0.0.1:4317:4317`).
 */
export interface ContainerOptions {
  /**
   * Addresses the computer running the container reaches the server from, through
   * the published port; requests from them count as the host. Usually the
   * container's gateway (see `containerGateway`).
   */
  hostAddresses: string[];
}

export interface RunningServer {
  url: string;
  workspace: Workspace;
  /** The repository of a git-backed Trayful. */
  git?: GitLink;
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
export { containerGateway } from './container.js';
export {
  FreshError,
  Repository,
  type ConnectInput,
  type Fresh,
  type RepositoryOptions,
  type RepositoryStatus,
} from './git/repository.js';
export { GitError, type GitAuthor } from './git/git.js';
export type { GitLink } from './git/link.js';
export type { SyncTimes } from './git/autosync.js';

export function defaultAppDir(): string {
  return resourceDir('app');
}

/** Starts the local Trayful server for a project, or a folder of projects. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const extensions = options.extensions ?? [];
  // Checked first, so a mistake stops the start before anything is opened.
  const access = accessWith(extensions, localAccess(options.container?.hostAddresses));
  const { workspace, git } = await openWorkspace(options);
  const space = openSpace(workspace, git);
  const app = Fastify({ logger: options.logger ?? false });
  app.decorate('access', access);
  await app.register(fastifyWebsocket);

  const ctx = routeContext(app, spacesWith(extensions, space));
  registerGuards(
    ctx,
    extensions.flatMap((e) => e.tokenRoutes ?? []),
  );
  for (const extension of extensions) extension.register?.(app);
  registerRepositoryRoutes(ctx);
  registerPlayerRoutes(ctx);
  registerEngineRoutes(ctx);
  registerTableRoutes(ctx);
  registerAuthoringRoutes(ctx);
  registerTrayRoutes(ctx);
  registerAssetRoutes(ctx);
  await registerFileRoutes(ctx, options.appDir ?? defaultAppDir());
  registerSocket(ctx);
  registerMcp(ctx);

  const address = await app.listen({
    port: options.port ?? DEFAULT_PORT,
    host: options.container ? '0.0.0.0' : (options.host ?? '127.0.0.1'),
  });
  // Listening on every interface, the table is still at localhost for the host.
  space.url = address.replace(/\/\/(0\.0\.0\.0|\[::\])(?=:)/, '//localhost');

  const port = new URL(address).port;
  if (options.host === '0.0.0.0' || options.host === '::') {
    for (const ip of lanAddresses()) space.shareBases.push(`http://${ip}:${port}`);
  }

  return {
    url: space.url,
    workspace,
    git,
    get session() {
      return workspace.active;
    },
    app,
    shareBases: space.shareBases,
    addShareBase(base: string) {
      space.shareBases.unshift(withoutTrailingSlashes(base));
    },
    async inviteLinks(query: TableQuery = {}) {
      const { project, table } = targetIn(space, query);
      const invite = await workspace.players.invite(project, table);
      return space.shareBases.map((base) => `${base}/join/${invite.token}`);
    },
    async close() {
      git?.close();
      await app.close();
      await workspace.close();
    },
  };
}

/** The workspace for a project folder, or for a repository's clone. */
async function openWorkspace(
  options: ServerOptions,
): Promise<{ workspace: Workspace; git?: GitLink }> {
  const open = {
    project: options.project,
    table: options.table,
    seed: options.seed,
    setup: options.setup,
    watch: options.watch,
    agentPace: options.agentPace,
    hostName: options.hostName,
  };
  if (options.repository) {
    const git = await GitLink.open(options.repository, open, options.syncTimes);
    return { workspace: git.workspace, git };
  }
  if (!options.projectDir) throw new Error('Give a project folder or a repository.');
  return { workspace: await Workspace.open(options.projectDir, open) };
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
