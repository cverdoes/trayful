import { UsageError } from './errors.js';

/** What `play` and `mcp` take on the command line; `mcp` ignores the browser and sharing ones. */
export interface PlayOptions {
  dir: string;
  table?: string;
  port?: number;
  seed?: number;
  setup?: string | false;
  project?: string;
  open: boolean;
  share: boolean;
  tunnel: boolean;
  container: boolean;
  /** Owner mode: the owner secret comes from `TRAYFUL_OWNER_SECRET`. See docs/howto/host-your-own.md. */
  owner: boolean;
  /** The address others reach this server at, such as `https://trayful.example.com`, for invite links. */
  publicUrl?: string;
  /** Hold each agent move until people watching have seen it (default); `--no-pace` lets agents rush. */
  pace?: boolean;
}

/** Options that are on or off. */
const SWITCHES = new Map<string, Partial<PlayOptions>>([
  ['--no-open', { open: false }],
  ['--no-pace', { pace: false }],
  ['--share', { share: true }],
  ['--tunnel', { tunnel: true }],
  // Inside a container nothing can open a browser.
  ['--container', { container: true, open: false }],
  // A server somewhere has nobody at it to open a browser for.
  ['--owner', { owner: true, open: false }],
]);

/** Options followed by a value. */
const SETTINGS = new Map<string, (value: string | undefined) => Partial<PlayOptions>>([
  ['--table', (table) => ({ table })],
  ['--project', (project) => ({ project })],
  ['--port', (value) => ({ port: wholeNumber('--port', value) })],
  ['--seed', (value) => ({ seed: wholeNumber('--seed', value) })],
  ['--setup', (value) => ({ setup: setupName(value) })],
  ['--public-url', (value) => ({ publicUrl: webAddress(value) })],
]);

/** Reads the options of `play` and `mcp`; throws a `UsageError` on anything it does not know. */
export function parsePlayArgs(args: string[]): PlayOptions {
  const options: PlayOptions = {
    dir: '.',
    open: true,
    share: false,
    tunnel: false,
    container: false,
    owner: false,
    pace: true,
  };
  const dirs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const setting = SETTINGS.get(arg);
    const toggle = SWITCHES.get(arg);
    if (setting) Object.assign(options, setting(args[++i]));
    else if (toggle) Object.assign(options, toggle);
    else if (arg.startsWith('--')) throw new UsageError(`Unknown option "${arg}".`);
    else dirs.push(arg);
  }
  if (dirs.length > 1) throw new UsageError('Give one project folder.');
  if (options.container && options.share) {
    throw new UsageError('--share does not work in a container: its addresses are its own.');
  }
  if (dirs[0]) options.dir = dirs[0];
  return options;
}

function wholeNumber(option: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new UsageError(`${option} needs a whole number.`);
  return n;
}

function webAddress(value: string | undefined): string {
  if (!value || !/^https?:\/\/[^/]/.test(value)) {
    throw new UsageError('--public-url needs a web address, such as https://trayful.example.com.');
  }
  return value;
}

function setupName(value: string | undefined): string | false {
  if (!value) throw new UsageError('--setup needs a setup name, or "none".');
  return value === 'none' ? false : value;
}
