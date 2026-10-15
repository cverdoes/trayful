import { DEFAULT_PORT, ProjectLoadError } from '@trayful/server';
import { CliError, UsageError } from './errors.js';
import { mcp } from './mcp.js';
import { newProject } from './new.js';
import { parsePlayArgs } from './options.js';
import { play } from './play.js';
import { TunnelError } from './tunnel.js';
import { validate } from './validate.js';

const HELP = `Usage: trayful <command> [options]

Commands:
  new <folder> [--name <name>]
                           Start a new prototype from the starter template.
  play [project-dir]       Open the project on a table in your browser (default: this folder).
                           Give a folder of projects to switch between them in the browser.
                           --project <id>  in a folder of projects, the one to open first
                           --table <name>  which saved table to open (default table-1)
                           --port <n>      port for the local server (default ${DEFAULT_PORT})
                           --seed <n>      shuffle seed for a new table
                           --setup <name>  setup for a new table (default: the manifest's
                                           setup; "none" lays everything out in rows)
                           --no-open       do not open a browser window
                           --share         let others on your network join, through
                                           invite links printed at start
                           --tunnel        let others anywhere join, through a Cloudflare
                                           quick tunnel (needs cloudflared; no account)
  mcp [project-dir]        Let an AI agent play the table over MCP (stdio). Shares the table
                           with \`trayful play\` if it is running; same options as play.
                           Agents can also connect over HTTP at http://127.0.0.1:${DEFAULT_PORT}/mcp.
  validate <project-dir>   Check a project folder and report problems with file and line.
                           Add --json for machine-readable output.
  help                     Show this message.
`;

const USAGE: Record<string, string> = {
  new: 'trayful new <folder> [--name <name>]',
  validate: 'trayful validate <project-dir> [--json]',
  play: 'trayful play [project-dir] [--table <name>] [--port <n>] [--seed <n>] [--setup <name>] [--no-open] [--share] [--tunnel]',
  mcp: 'trayful mcp [project-dir] [--table <name>] [--port <n>] [--seed <n>] [--setup <name>]',
};

/** Runs the CLI and returns the process exit code. */
export async function run(args: string[], out = console.log, err = console.error): Promise<number> {
  const [command, ...rest] = args;
  try {
    switch (command) {
      case 'validate':
        return await validate(rest, out, err);
      case 'new':
        return await newProject(rest, out);
      case 'play':
        return await play(parsePlayArgs(rest), out);
      case 'mcp':
        return await mcp(parsePlayArgs(rest), err);
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
  } catch (e) {
    return report(e, command!, err);
  }
}

/** Prints an error the person can act on and returns the exit code; rethrows any other. */
function report(e: unknown, command: string, err: (s: string) => void): number {
  if (e instanceof UsageError) {
    err(`${e.message}\nUsage: ${USAGE[command]}`);
    return 2;
  }
  if (e instanceof CliError || e instanceof ProjectLoadError || e instanceof TunnelError) {
    err(e.message);
    return 1;
  }
  throw e;
}
