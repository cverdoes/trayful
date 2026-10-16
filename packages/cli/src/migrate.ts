import { migrateFolder } from '@trayful/server';
import { UsageError } from './errors.js';

/** `trayful migrate`: rewrites a project in the first file format in the current one. */
export async function migrate(args: string[], out: (s: string) => void): Promise<number> {
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) throw new UsageError('Give the project folder to migrate.');
  const files = await migrateFolder(dir);
  out(`Migrated ${dir} to the current file format. Wrote:\n  ${files.join('\n  ')}`);
  return 0;
}
