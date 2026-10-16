import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_PORT,
  containerGateway,
  defaultAppDir,
  startServer,
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
  try {
    return await startServer({
      projectDir: path.resolve(options.dir),
      project: options.project,
      table: options.table,
      port: options.port,
      seed: options.seed,
      setup: options.setup,
      appDir,
      // Sharing on the network listens on every interface; a tunnel reaches us locally.
      host: options.share ? '0.0.0.0' : undefined,
      container: options.container ? inContainer() : undefined,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
    throw new CliError(
      `Port ${options.port ?? DEFAULT_PORT} is in use. Is Trayful already running? Try --port <n>.`,
    );
  }
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
  const { session, url } = server;
  out(`${session.project.manifest.name} is on the table at ${url}`);
  const saved = path.relative(process.cwd(), session.file);
  out(`Saving to ${saved.startsWith('..') ? session.file : saved}.`);
  const projects = server.workspace.projects().length;
  if (projects > 1) out(`${projects} projects in this folder; switch between them in the browser.`);
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
