/**
 * `pnpm docs:overview`: builds the architecture overview, a clickable HTML site made
 * from the source and the pages in `architecture/`, into `.reports/overview/`.
 *
 *   --check      only check that the pages in `architecture/` still match the code
 *   --open       open the site in a browser when it is built
 *   --out <dir>  write the site somewhere else
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { argv, exit, platform } from 'node:process';
import { pathToFileURL } from 'node:url';
import { DEFAULT_OUT, ROOT } from './overview/config.js';
import { buildModel, checkModel, writeSite } from './overview/site.js';

function option(name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

/** The command that opens a file or URL with the system's default program. */
function opener(url: string): [string, string[]] {
  if (platform === 'darwin') return ['open', [url]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  return ['xdg-open', [url]];
}

function openInBrowser(file: string): void {
  const [command, args] = opener(pathToFileURL(file).href);
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

const model = await buildModel();
const problems = checkModel(model);
for (const problem of problems) console.error(problem);

if (argv.includes('--check')) {
  if (problems.length > 0) {
    console.error(`\nThe architecture overview is out of date: ${problems.length} problems.`);
    exit(1);
  }
  console.log(
    `Architecture overview: ${model.concepts.length} pages in architecture/ match the code.`,
  );
} else {
  const out = path.resolve(ROOT, option('--out') ?? DEFAULT_OUT);
  const count = await writeSite(model, out).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    exit(1);
  });
  const index = path.join(out, 'index.html');
  console.log(`Wrote ${count} pages. Open ${pathToFileURL(index).href}`);
  if (argv.includes('--open')) openInBrowser(index);
  if (problems.length > 0) exit(1);
}
