import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * This Trayful's version. A packaged Trayful has its package.json beside the bundled
 * file; in this repository it is the cli package's own. `from` only changes in tests.
 */
export function version(from: string = import.meta.url): string {
  const beside = fileURLToPath(new URL('package.json', from));
  const file = existsSync(beside) ? beside : fileURLToPath(new URL('../package.json', from));
  return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
}
