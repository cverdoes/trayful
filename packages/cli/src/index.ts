import { DEFAULT_PORT, MigrateError, ProjectLoadError } from '@trayful/server';
import { CliError, UsageError } from './errors.js';
import { mcp } from './mcp.js';
import { migrate } from './migrate.js';
import { newProject } from './new.js';
import { parsePlayArgs } from './options.js';
import { play } from './play.js';
import { skill } from './skill.js';
import { TunnelError } from './tunnel.js';
import { validate } from './validate.js';
import { version } from './version.js';

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
                           --container     run inside a container (see the Docker section
                                           of the README); implies --no-open
  mcp [project-dir]        Let an AI agent play the table over MCP (stdio). Shares the table
                           with \`trayful play\` if it is running; same options as play.
                           Agents can also connect over HTTP at http://127.0.0.1:${DEFAULT_PORT}/mcp.
  validate <project-dir>   Check a project folder and report problems with file and line.
                           Add --json for machine-readable output.
  migrate <project-dir>    Rewrite a project made for an earlier Trayful in the current
                           file format.
  skill [repo-dir]         Add the Trayful skill to a repository (default: this folder),
                           in .claude/skills/trayful, so Claude Code knows how to design
                           and play with Trayful over MCP there.
  help                     Show this message.
  --version                Show which version of Trayful this is.
`;

const USAGE: Record<string, string> = {
  new: 'trayful new <folder> [--name <name>]',
  validate: 'trayful validate <project-dir> [--json]',
  migrate: 'trayful migrate <project-dir>',
  skill: 'trayful skill [repo-dir]',
  play: 'trayful play [project-dir] [--table <name>] [--port <n>] [--seed <n>] [--setup <name>] [--no-open] [--share] [--tunnel] [--container]',
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
      case 'migrate':
        return await migrate(rest, out);
      case 'skill':
        return await skill(rest, out);
      case 'play':
        return await play(parsePlayArgs(rest), out);
      case 'mcp':
        return await mcp(parsePlayArgs(rest), err);
      case '--version':
      case '-v':
        out(version());
        return 0;
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
  if (
    e instanceof CliError ||
    e instanceof ProjectLoadError ||
    e instanceof TunnelError ||
    e instanceof MigrateError
  ) {
    err(e.message);
    return 1;
  }
  throw e;
}
