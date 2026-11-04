/**
 * Keeps the docs honest: every file a guide quotes must match the example it
 * names, and every relative link must point at a file that exists.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const docs = path.join(root, 'docs');

async function markdownFiles(): Promise<string[]> {
  const files = await readdir(docs, { recursive: true });
  return files.filter((f) => f.endsWith('.md')).map((f) => path.join(docs, f));
}

describe('docs', async () => {
  const files = await markdownFiles();

  it('has a guide for every task in the plan', () => {
    const guides = files.filter((f) => f.includes(`${path.sep}howto${path.sep}`));
    expect(guides.length).toBeGreaterThanOrEqual(9);
  });

  for (const file of files) {
    const name = path.relative(root, file);

    it(`${name} quotes its examples exactly`, async () => {
      const text = await readFile(file, 'utf8');
      const quotes = [...text.matchAll(/<!-- example: (\S+) -->\s*```\w*\n([\s\S]*?)```/g)];
      for (const [, example, block] of quotes) {
        const source = path.join(root, example!);
        expect(existsSync(source), `${name}: ${example} does not exist`).toBe(true);
        const content = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n');
        // Guides quote nested parts of a file without their indentation.
        const found = [0, 2, 4, 6, 8].some((n) =>
          content.includes(block!.replace(/^(?=.)/gm, ' '.repeat(n))),
        );
        expect(found, `${name}: the block quoting ${example} has drifted`).toBe(true);
      }
    });

    it(`${name} links to files that exist`, async () => {
      const text = await readFile(file, 'utf8');
      for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (/^(https?:|mailto:|#)/.test(target!)) continue;
        const relative = decodeURI(target!.split('#')[0]!);
        expect(
          existsSync(path.resolve(path.dirname(file), relative)),
          `${name} links to ${target}`,
        ).toBe(true);
      }
    });
  }
});
