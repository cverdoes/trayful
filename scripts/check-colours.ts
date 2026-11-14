/**
 * Fails when a stylesheet of the app names a colour of its own. Colours live in one
 * place, packages/app/src/tokens.css, and every other rule uses them by role
 * (`var(--tf-surface)`), so the whole interface changes together when they do.
 *
 * It finds hex colours, `rgb()`, `rgba()`, `hsl()`, `hsla()` and the keywords
 * `white` and `black`, outside comments.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/** Where the stylesheets are, and the one file allowed to hold colour values. */
const STYLES = 'packages/app/src';
const TOKENS = 'packages/app/src/tokens.css';

/** A hex colour, a colour function, and a colour keyword that is not part of a longer word. */
const COLOURS = [
  /#[\da-f]{3,8}\b/gi,
  /\b(?:rgba?|hsla?)\(/gi,
  /(?<![\w-])(?:white|black)(?![\w-])/gi,
];

export interface Finding {
  line: number;
  text: string;
}

/** Comments blanked out, keeping the line breaks so line numbers still match. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** Every colour named in a stylesheet, with the line it is on. */
export function coloursIn(css: string): Finding[] {
  const findings: Finding[] = [];
  withoutComments(css)
    .split('\n')
    .forEach((line, i) => {
      const matches = COLOURS.flatMap((pattern) => [...line.matchAll(pattern)]);
      matches.sort((a, b) => a.index - b.index);
      for (const match of matches) findings.push({ line: i + 1, text: match[0] });
    });
  return findings;
}

async function stylesheets(): Promise<string[]> {
  const files = await readdir(path.join(root, STYLES), { recursive: true });
  return files
    .filter((f) => f.endsWith('.css'))
    .map((f) => path.join(STYLES, f))
    .filter((f) => f !== TOKENS)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  let count = 0;
  for (const file of await stylesheets()) {
    for (const { line, text } of coloursIn(await readFile(path.join(root, file), 'utf8'))) {
      console.error(`${file}:${line}: ${text} is a colour; use a token from ${TOKENS}`);
      count++;
    }
  }
  if (count > 0) process.exit(1);
  console.log('Every colour comes from the tokens.');
}

// Run only as a script, so tests can import the functions above.
if (path.resolve(process.argv[1] ?? '') === import.meta.filename) await main();
