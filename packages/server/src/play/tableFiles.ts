import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ResolvedProject } from '@trayful/formats';
import type { PromptStatus } from './prompts.js';

/** Where a table is saved: `tables/<name>.json` in its project. */
export function tableFile(project: ResolvedProject, name: string): string {
  return path.join(project.dir, 'tables', `${name}.json`);
}

/** How the file of a table's open prompts ends, after the table's name. */
export const PROMPTS_SUFFIX = '.prompts.json';

/** Where a table's open prompts wait while the server is stopped, beside the table file. */
export function promptsFile(project: ResolvedProject, name: string): string {
  return path.join(project.dir, 'tables', `${name}${PROMPTS_SUFFIX}`);
}

/** Writes JSON to a temporary file first, so a crash never leaves half a file. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, file);
}

/** Keeps the open prompts with the table, and removes the file once there are none. */
export async function savePrompts(file: string, open: readonly PromptStatus[]): Promise<void> {
  if (open.length > 0) await writeJson(file, { prompts: open });
  else await rm(file, { force: true });
}

/**
 * The prompts a table had open when it was last saved. A file that cannot be read loses
 * them rather than keeping the table shut: whoever asked can ask again.
 */
export async function readSavedPrompts(file: string): Promise<PromptStatus[]> {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as { prompts?: PromptStatus[] };
    return Array.isArray(saved.prompts) ? saved.prompts : [];
  } catch {
    return [];
  }
}
