import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository's `docs/` folder, served to agents as `trayful://docs`: HOWTO
 * guides for designers and the generated format reference.
 */
function docsDir(): string {
  return fileURLToPath(new URL('../../../docs', import.meta.url));
}

/** Markdown files under `docs/`, as paths relative to it, guides first. */
export async function docFiles(): Promise<string[]> {
  const files = await readdir(docsDir(), { recursive: true });
  return files
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function rank(file: string): number {
  if (file === 'README.md') return 0;
  if (file.startsWith('howto/')) return 1;
  return 2;
}

export async function readDoc(file: string): Promise<string> {
  const full = path.resolve(docsDir(), file);
  if (!full.startsWith(docsDir() + path.sep) || !full.endsWith('.md')) {
    throw new Error(`No document "${file}".`);
  }
  try {
    return await readFile(full, 'utf8');
  } catch {
    throw new Error(`No document "${file}". Read trayful://docs for the list.`);
  }
}

/** A list of every document with its title, so an agent can pick what to read. */
export async function docsIndex(): Promise<string> {
  const lines = [
    '# Trayful documentation',
    '',
    'Read a page as `trayful://docs/<path>`. HOWTO guides walk through common tasks; the reference documents every key of every file kind.',
    '',
  ];
  for (const file of await docFiles()) {
    const text = await readDoc(file);
    const heading = text.split('\n').find((line) => line.startsWith('# '));
    const title = heading?.slice(2).trim() ?? file;
    lines.push(`- \`${file}\`: ${title}`);
  }
  return lines.join('\n') + '\n';
}
