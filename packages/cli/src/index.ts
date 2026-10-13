import { existsSync } from 'node:fs';
import path from 'node:path';
import { formatDiagnostic, hasErrors, loadProject } from '@trayful/formats';
import { DEFAULT_PORT, defaultAppDir, ProjectLoadError, startServer } from '@trayful/server';
import open from 'open';
import { mcp } from './mcp.js';

const HELP = `Usage: trayful <command> [options]

Commands:
  play [project-dir]       Open the project on a table in your browser (default: this folder).
                           --table <name>  which saved table to open (default table-1)
                           --port <n>      port for the local server (default ${DEFAULT_PORT})
                           --seed <n>      shuffle seed for a new table
                           --setup <name>  setup for a new table (default: the manifest's
                                           setup; "none" lays everything out in rows)
                           --no-open       do not open a browser window
  mcp [project-dir]        Let an AI agent play the table over MCP (stdio). Shares the table
                           with \`trayful play\` if it is running; same options as play.
                           Agents can also connect over HTTP at http://127.0.0.1:${DEFAULT_PORT}/mcp.
  validate <project-dir>   Check a project folder and report problems with file and line.
                           Add --json for machine-readable output.
  help                     Show this message.
`;

/** Runs the CLI and returns the process exit code. */
export async function run(args: string[], out = console.log, err = console.error): Promise<number> {
  const [command, ...rest] = args;
  switch (command) {
    case 'validate':
      return validate(rest, out, err);
    case 'play':
      return play(rest, out, err);
    case 'mcp': {
      const options = parsePlayArgs(rest);
      if (typeof options === 'string') {
        err(
          `${options}\nUsage: trayful mcp [project-dir] [--table <name>] [--port <n>] [--seed <n>] [--setup <name>]`,
        );
        return 2;
      }
      return mcp(options, err);
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      out(HELP);
      return 0;
    default:
      err(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

async function validate(
  args: string[],
  out: (s: string) => void,
  err: (s: string) => void,
): Promise<number> {
  const json = args.includes('--json');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    err('Usage: trayful validate <project-dir> [--json]');
    return 2;
  }
  const { project, diagnostics } = await loadProject(dir);
  if (json) {
    out(JSON.stringify({ ok: !hasErrors(diagnostics), diagnostics }, null, 2));
    return hasErrors(diagnostics) ? 1 : 0;
  }
  for (const d of diagnostics) (d.severity === 'error' ? err : out)(formatDiagnostic(d));
  if (!project) {
    const errors = diagnostics.filter((d) => d.severity === 'error').length;
    err(`\n${errors} ${errors === 1 ? 'error' : 'errors'} in ${dir}`);
    return 1;
  }
  const decks = Object.keys(project.decks).length;
  const setups = Object.keys(project.setups).length;
  out(
    `✓ ${project.manifest.name}: ${Object.keys(project.types).length} types, ` +
      `${project.components.length} components, ${decks} ${decks === 1 ? 'deck' : 'decks'}, ` +
      `${setups} ${setups === 1 ? 'setup' : 'setups'}`,
  );
  return 0;
}

interface PlayOptions {
  dir: string;
  table?: string;
  port?: number;
  seed?: number;
  setup?: string | false;
  open: boolean;
}

function parsePlayArgs(args: string[]): PlayOptions | string {
  const options: PlayOptions = { dir: '.', open: true };
  const dirs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const value = () => args[++i];
    const number = (name: string) => {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 0) throw new Error(`${name} needs a whole number.`);
      return n;
    };
    try {
      if (arg === '--table') options.table = value();
      else if (arg === '--port') options.port = number('--port');
      else if (arg === '--seed') options.seed = number('--seed');
      else if (arg === '--setup') {
        const name = value();
        if (!name) return '--setup needs a setup name, or "none".';
        options.setup = name === 'none' ? false : name;
      } else if (arg === '--no-open') options.open = false;
      else if (arg.startsWith('--')) return `Unknown option "${arg}".`;
      else dirs.push(arg);
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (dirs.length > 1) return 'Give one project folder.';
  if (dirs[0]) options.dir = dirs[0];
  return options;
}

async function play(
  args: string[],
  out: (s: string) => void,
  err: (s: string) => void,
): Promise<number> {
  const options = parsePlayArgs(args);
  if (typeof options === 'string') {
    err(
      `${options}\nUsage: trayful play [project-dir] [--table <name>] [--port <n>] [--seed <n>] [--setup <name>] [--no-open]`,
    );
    return 2;
  }
  if (!existsSync(path.join(defaultAppDir(), 'index.html'))) {
    err(
      'The browser app has not been built yet. Run `pnpm build` in the Trayful repository first.',
    );
    return 1;
  }
  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({
      projectDir: path.resolve(options.dir),
      table: options.table,
      port: options.port,
      seed: options.seed,
      setup: options.setup,
    });
  } catch (e) {
    if (e instanceof ProjectLoadError) {
      err(e.message);
      return 1;
    }
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      err(
        `Port ${options.port ?? DEFAULT_PORT} is in use. Is Trayful already running? Try --port <n>.`,
      );
      return 1;
    }
    throw e;
  }
  const { session, url } = server;
  out(`${session.project.manifest.name} is on the table at ${url}`);
  const saved = path.relative(process.cwd(), session.file);
  out(`Saving to ${saved.startsWith('..') ? session.file : saved}. Press Ctrl+C to stop.`);

  // CI uses this to check that the server starts and serves the app, then exits.
  if (process.env.TRAYFUL_SMOKE_TEST) {
    const page = await fetch(url);
    await server.close();
    if (!page.ok) {
      err(`Smoke test failed: ${url} answered ${page.status}.`);
      return 1;
    }
    out('Smoke test passed.');
    return 0;
  }

  if (options.open) open(url).catch(() => out(`Open ${url} in your browser.`));
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  out('\nSaving and stopping…');
  await server.close();
  return 0;
}
