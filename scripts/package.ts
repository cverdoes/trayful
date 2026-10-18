/**
 * Builds the `trayful` npm package in `packages/cli/dist`: one bundled file with the
 * CLI, server, core and formats, a launcher that checks the Node version, and the
 * resources the server reads at run time (see packages/server/src/resources.ts).
 * Run it through `pnpm package`, which builds the browser app first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOURCE_SOURCES } from '@trayful/server';
import { build, type Metafile } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = path.join(root, 'packages/cli');
const out = path.join(cli, 'dist');

/** The oldest Node.js the bundle runs on: `engines.node` in the root package.json. */
const NODE = oldestNode();

interface PackageInfo {
  name: string;
  version: string;
  license: string;
  dir: string;
}

const appDir = path.join(root, RESOURCE_SOURCES.app);
if (!existsSync(path.join(appDir, 'index.html'))) {
  console.error('The browser app is not built. Run `pnpm package`, which builds it first.');
  process.exit(1);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const metafile = await bundle();
await writeLauncher();
for (const [name, from] of Object.entries(RESOURCE_SOURCES)) {
  await cp(path.join(root, from), path.join(out, 'resources', name), { recursive: true });
}
const version = readJson(path.join(cli, 'package.json')).version as string;
await writeFile(path.join(out, 'package.json'), JSON.stringify(manifest(version), null, 2) + '\n');
await cp(path.join(cli, 'npm/README.md'), path.join(out, 'README.md'));
await cp(path.join(root, 'LICENSE.md'), path.join(out, 'LICENSE.md'));
await writeFile(path.join(out, 'THIRD_PARTY_LICENSES.md'), notices(bundledPackages(metafile)));
console.log(`Built trayful ${version} in ${path.relative(root, out)}`);

/** Bundles the CLI and everything it imports, except Node's own modules, into one file. */
async function bundle(): Promise<Metafile> {
  const result = await build({
    entryPoints: [path.join(cli, 'src/main.ts')],
    outfile: path.join(out, 'trayful.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: `node${NODE.major}`,
    // Some dependencies still call require(); give the ES module one.
    banner: {
      js: "import { createRequire as __trayfulRequire } from 'node:module'; const require = __trayfulRequire(import.meta.url);",
    },
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
  });
  return result.metafile;
}

/**
 * The `trayful` command. It checks the Node version before loading the bundle, so an
 * old Node says what to install instead of failing somewhere inside.
 */
async function writeLauncher(): Promise<void> {
  const launcher = path.join(out, 'trayful.js');
  await writeFile(
    launcher,
    `#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < ${NODE.major} || (major === ${NODE.major} && minor < ${NODE.minor})) {
  console.error(
    'Trayful needs Node.js ${NODE.major}.${NODE.minor} or newer, and this is ' + process.version + '.\\n' +
      'Get a current version from https://nodejs.org.',
  );
  process.exit(1);
}
await import('./trayful.mjs');
`,
  );
  await chmod(launcher, 0o755);
}

function manifest(version: string): Record<string, unknown> {
  return {
    name: 'trayful',
    version,
    description:
      'Where your game comes together. A boardgame prototyping table in your browser: describe components in YAML, play with them, let AI agents join over MCP.',
    license: 'FSL-1.1-MIT',
    type: 'module',
    bin: { trayful: 'trayful.js' },
    engines: { node: `>=${NODE.major}.${NODE.minor}` },
    repository: { type: 'git', url: 'git+https://github.com/cverdoes/trayful.git' },
    homepage: 'https://github.com/cverdoes/trayful#readme',
    keywords: ['boardgame', 'prototyping', 'tabletop', 'mcp', 'print-and-play'],
  };
}

/** Packages whose code ended up in the bundle or in the browser app. */
function bundledPackages(metafile: Metafile): PackageInfo[] {
  const dirs = new Set<string>();
  for (const input of Object.keys(metafile.inputs)) {
    const dir = packageDir(path.resolve(root, input));
    if (dir) dirs.add(dir);
  }
  for (const dir of appPackageDirs()) dirs.add(dir);
  // pnpm can install one version in several folders; list each version once.
  const byVersion = new Map<string, PackageInfo>();
  for (const dir of dirs) {
    const info = { ...readJson(path.join(dir, 'package.json')), dir } as PackageInfo;
    byVersion.set(`${info.name}@${info.version}`, info);
  }
  return [...byVersion.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

/** The installed package a bundled file belongs to, or nothing for this repository's own code. */
function packageDir(file: string): string | undefined {
  if (!file.includes(`${path.sep}node_modules${path.sep}`)) return undefined;
  let dir = path.dirname(file);
  while (
    !existsSync(path.join(dir, 'package.json')) ||
    !readJson(path.join(dir, 'package.json')).name
  ) {
    dir = path.dirname(dir);
  }
  return dir;
}

/** Runtime dependencies of the browser app, which Vite bundles separately. */
function appPackageDirs(): string[] {
  const listing = execFileSync(
    'pnpm',
    ['licenses', 'list', '--prod', '--json', '--filter', '@trayful/app'],
    // On Windows pnpm is a .cmd file, which only a shell can run.
    { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  const byLicense = JSON.parse(listing) as Record<string, { name: string; paths: string[] }[]>;
  return Object.values(byLicense)
    .flat()
    .filter((entry) => !entry.name.startsWith('@types/'))
    .flatMap((entry) => entry.paths);
}

/** Every bundled package's licence text, as their licences ask when redistributing. */
function notices(packages: PackageInfo[]): string {
  const sections = packages.map(({ name, version, license, dir }) => {
    const text = licenceText(dir) ?? `Licensed under ${license}; no licence file is included.`;
    return `## ${name} ${version}\n\nLicence: ${license}\n\n\`\`\`text\n${text.trim()}\n\`\`\`\n`;
  });
  return `# Third-party licences\n\nTrayful bundles these packages. Their licences follow.\n\n${sections.join('\n')}`;
}

function licenceText(dir: string): string | undefined {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  return file ? readFileSync(path.join(dir, file), 'utf8') : undefined;
}

function oldestNode(): { major: number; minor: number } {
  const engines = readJson(path.join(root, 'package.json')).engines as { node: string };
  const [, major, minor] = /^>=(\d+)\.(\d+)/.exec(engines.node) ?? [];
  if (!major || !minor) throw new Error(`Cannot read engines.node "${engines.node}".`);
  return { major: Number(major), minor: Number(minor) };
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}
