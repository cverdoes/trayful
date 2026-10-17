// Files Trayful ships with besides its code: the browser app, the starter project,
// the JSON Schemas and the docs.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Resource = 'app' | 'starter' | 'schemas' | 'docs';

/** Where each resource sits in this repository, relative to `packages/server/src/`. */
const IN_REPOSITORY: Record<Resource, string> = {
  app: '../../app/dist',
  starter: '../../../examples/starter',
  schemas: '../../formats/schema',
  docs: '../../../docs',
};

/**
 * The folder holding a resource. A packaged Trayful is one bundled file with a
 * `resources/` folder beside it, one folder per resource; in this repository each
 * lives in its own package. `from` is the running module's URL, and only changes in tests.
 */
export function resourceDir(resource: Resource, from: string = import.meta.url): string {
  const packaged = fileURLToPath(new URL(`resources/${resource}`, from));
  return existsSync(packaged) ? packaged : fileURLToPath(new URL(IN_REPOSITORY[resource], from));
}
