/**
 * The hand-written pages in `architecture/`: interaction walkthroughs and concepts.
 * Each starts with a small front matter block (title, kind, order, summary).
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONCEPTS_DIR, ROOT } from './config.js';
import type { Concept } from './model.js';

/** Splits `---\nkey: value\n---\nbody` into its fields and body. */
export function frontMatter(text: string): { fields: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const at = line.indexOf(':');
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return { fields, body: text.slice(match[0].length) };
}

/** Reads every page in `architecture/`, interactions first, then by `order`. */
export async function readConcepts(): Promise<Concept[]> {
  const concepts: Concept[] = [];
  for (const file of (await readdir(CONCEPTS_DIR)).filter((f) => f.endsWith('.md'))) {
    if (file === 'README.md') continue;
    const text = await readFile(path.join(CONCEPTS_DIR, file), 'utf8');
    const { fields, body } = frontMatter(text);
    concepts.push({
      slug: file.replace(/\.md$/, ''),
      title: fields.title ?? file,
      kind: fields.kind === 'interaction' ? 'interaction' : 'concept',
      order: Number(fields.order ?? 99),
      summary: fields.summary ?? '',
      markdown: body,
      path: `architecture/${file}`,
    });
  }
  const rank = (c: Concept) => (c.kind === 'interaction' ? 0 : 1);
  return concepts.sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

/** The date each file last changed in git, as `YYYY-MM-DD`; files git does not know are left out. */
export function lastChanged(files: string[]): Record<string, string> {
  const changed: Record<string, string> = {};
  for (const file of new Set(files)) {
    try {
      const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
      if (date) changed[file] = date;
    } catch {
      // Not a git checkout, such as an unpacked tarball: no dates.
    }
  }
  return changed;
}

/** The commit the site was built from, or `main` outside a git checkout. */
export function currentCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'main';
  }
}
