import path from 'node:path';
import { createProjectFolder } from '@trayful/server';
import { UsageError } from './errors.js';

/** `trayful new`: copies the starter project into a new folder. */
export async function newProject(args: string[], out: (s: string) => void): Promise<number> {
  const nameAt = args.indexOf('--name');
  const name = nameAt >= 0 ? args[nameAt + 1] : undefined;
  const dir = args.find((a, i) => !a.startsWith('--') && (nameAt < 0 || i !== nameAt + 1));
  if (!dir) throw new UsageError('Give a folder for the new project.');
  if (nameAt >= 0 && !name) throw new UsageError('--name needs a name.');
  const title = name ?? titleFor(dir);
  await createProjectFolder(path.resolve(dir), title);
  out(`Created "${title}" in ${dir}. Play it with: trayful play ${dir}`);
  return 0;
}

/** A game name from a folder name: `my_little-game` becomes "My Little Game". */
function titleFor(dir: string): string {
  return path
    .basename(path.resolve(dir))
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
