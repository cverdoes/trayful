import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PORT,
  containerGateway,
  defaultAppDir,
  GitError,
  OwnerError,
  Repository,
  startServer,
  type GitAuthor,
  type ContainerOptions,
  type RunningServer,
} from '@trayful/server';
import openBrowser from 'open';
import { CliError } from './errors.js';
import type { PlayOptions } from './options.js';
import { startTunnel, type Tunnel } from './tunnel.js';

export interface PlayEnvironment {
  /** The built browser app. Default: the one in this repository. */
  appDir?: string;
  /** Resolves when the person wants to stop. Default: on Ctrl+C or a stop signal. */
  stopped?: () => Promise<void>;
}

/** `trayful play`: serves the table and opens it in the browser, until stopped. */
export async function play(
  options: PlayOptions,
  out: (s: string) => void,
  { appDir = defaultAppDir(), stopped = untilSignal }: PlayEnvironment = {},
): Promise<number> {
  if (!existsSync(path.join(appDir, 'index.html'))) {
    throw new CliError(
      'The browser app has not been built yet. Run `pnpm build` in the Trayful repository first.',
    );
  }
  const server = await startTable(options, appDir);
  if (options.publicUrl) server.addShareBase(options.publicUrl);
  const tunnel = options.tunnel ? await openTunnel(server, out) : undefined;
  try {
    await announce(server, out);
    // CI uses this to check that the server starts and serves the app, then exits.
    if (process.env.TRAYFUL_SMOKE_TEST) await smokeTest(server.url, out);
    else await serve(server.url, options.open, out, stopped);
  } finally {
    tunnel?.close();
    await server.close();
  }
  return 0;
}

async function startTable(options: PlayOptions, appDir: string): Promise<RunningServer> {
  const repository = await gitRepository(options);
  try {
    return await startServer({
      projectDir: repository ? undefined : path.resolve(options.dir),
      repository,
      project: options.project,
      table: options.table,
      port: options.port,
      seed: options.seed,
      setup: options.setup,
      appDir,
      // Sharing on the network listens on every interface; a tunnel reaches us locally.
      host: options.share ? '0.0.0.0' : undefined,
      container: options.container ? inContainer() : undefined,
      ownerSecret: options.owner ? ownerSecret() : undefined,
      agentPace: options.pace,
    });
  } catch (e) {
    if (e instanceof OwnerError) throw new CliError(e.message);
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    throw new CliError(
      `Port ${options.port ?? DEFAULT_PORT} is in use. Is Trayful already running? Try --port <n>.`,
    );
  }
}

/**
 * With `--data`: the repository Trayful keeps there, connected to `--repo` first if
 * it was given and nothing is connected yet.
 */
async function gitRepository(options: PlayOptions): Promise<Repository | undefined> {
  if (!options.data) return undefined;
  const dataDir = path.resolve(options.data);
  const repository = await Repository.open({ dataDir, token: gitToken(), author: gitAuthor() });
  const wanted = options.repo;
  const current = repository.settings;
  if (wanted && current && current.url !== wanted.url) {
    throw new CliError(
      `${dataDir} is already connected to ${current.url}. Give another --data folder for another repository.`,
    );
  }
  if (wanted && !current) {
    try {
      // Typed out on the command line, so a new branch or project is meant.
      await repository.connect({ ...wanted, create: true });
    } catch (e) {
      if (e instanceof GitError) throw new CliError(e.message);
      throw e;
    }
  }
  return repository;
}

/**
 * The token for HTTPS repositories, from TRAYFUL_GIT_TOKEN or the file named in
 * TRAYFUL_GIT_TOKEN_FILE, such as a Docker secret. Undefined for public or SSH ones.
 */
function gitToken(): string | undefined {
  const file = process.env.TRAYFUL_GIT_TOKEN_FILE;
  if (file) return readFileSync(file, 'utf8').trim();
  return filled(process.env.TRAYFUL_GIT_TOKEN);
}

/** Who Trayful's commits are by: TRAYFUL_GIT_NAME and TRAYFUL_GIT_EMAIL, or "Trayful". */
function gitAuthor(): GitAuthor | undefined {
  const name = filled(process.env.TRAYFUL_GIT_NAME);
  const email = filled(process.env.TRAYFUL_GIT_EMAIL);
  if (name === undefined && email === undefined) return undefined;
  return { name: name ?? 'Trayful', email: email ?? 'trayful@localhost' };
}

/** An environment variable's value, with an empty one counting as not set. */
function filled(value: string | undefined): string | undefined {
  return value === '' ? undefined : value;
}

/** The owner secret, from the environment so it stays out of the process list and shell history. */
function ownerSecret(): string {
  const secret = process.env.TRAYFUL_OWNER_SECRET;
  if (!secret) {
    throw new CliError(
      '--owner needs the owner secret in TRAYFUL_OWNER_SECRET. Make one with `openssl rand -hex 32`.',
    );
  }
  return secret;
}

function inContainer(): ContainerOptions {
  const gateway = containerGateway();
  if (!gateway) {
    throw new CliError(
      '--container found no network gateway. Is this running in a Linux container?',
    );
  }
  return { hostAddresses: [gateway] };
}

/** Opens a tunnel to the server and adds its address to the invite links. */
async function openTunnel(server: RunningServer, out: (s: string) => void): Promise<Tunnel> {
  out('Opening a tunnel…');
  try {
    const tunnel = await startTunnel(Number(new URL(server.url).port));
    server.addShareBase(tunnel.url);
    return tunnel;
  } catch (e) {
    await server.close();
    throw e;
  }
}

/** Tells the person where the table is, where it saves, and how others can join. */
async function announce(server: RunningServer, out: (s: string) => void): Promise<void> {
  const { url, git } = server;
  if (!server.workspace.ready) {
    out(`Trayful is waiting for a repository at ${url}`);
    out('Connect one with connect_repository over MCP. Press Ctrl+C to stop.');
    return;
  }
  const { session } = server;
  out(`${session.project.manifest.name} is on the table at ${url}`);
  if (git?.repository.settings) {
    const { url: repo, branch, path: folder } = git.repository.settings;
    out(`Working on ${repo}, branch ${branch}${folder ? `, folder ${folder}` : ''}.`);
  }
  const saved = path.relative(process.cwd(), session.file);
  out(`Saving to ${saved.startsWith('..') ? session.file : saved}.`);
  const projects = server.workspace.projects().length;
  if (projects > 1) out(`${projects} projects in this folder; switch between them in the browser.`);
  if (server.app.owner) {
    const base = server.shareBases[0] ?? 'this server';
    out(`Owner mode: sign in at ${base}/sign-in, and connect agents to ${base}/mcp.`);
  }
  if (server.shareBases.length) {
    // Invites are per table; this one is for the table that opened. Invite in the
    // browser to make links for other tables.
    out(
      `Invite others to ${session.tableName} with a link (anyone with it can join that table, so share it with care):`,
    );
    for (const link of await server.inviteLinks()) out(`  ${link}`);
    out('Invite in the toolbar makes links for other tables.');
  }
  out('Edits to the project files show up on the table when you save. Press Ctrl+C to stop.');
}

async function smokeTest(url: string, out: (s: string) => void): Promise<void> {
  const page = await fetch(url);
  if (!page.ok) throw new CliError(`Smoke test failed: ${url} answered ${page.status}.`);
  out('Smoke test passed.');
}

async function serve(
  url: string,
  open: boolean,
  out: (s: string) => void,
  stopped: () => Promise<void>,
): Promise<void> {
  if (open) openBrowser(url).catch(() => out(`Open ${url} in your browser.`));
  await stopped();
  out('\nSaving and stopping…');
}

function untilSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
}
