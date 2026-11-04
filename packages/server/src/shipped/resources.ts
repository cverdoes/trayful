// Files Trayful ships with besides its code: the browser app, the starter project,
// the JSON Schemas, the docs and the agent skill.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Resource = 'app' | 'starter' | 'schemas' | 'docs' | 'skill';

/** Where each resource sits in this repository, from its root. The npm package copies them. */
export const RESOURCE_SOURCES: Record<Resource, string> = {
  app: 'packages/app/dist',
  starter: 'examples/starter',
  schemas: 'packages/formats/schema',
  docs: 'docs',
  skill: 'skills/trayful',
};

/** The repository root, seen from `packages/server/src/`. */
const REPOSITORY_ROOT = '../../../';

/**
 * The folder holding a resource. A packaged Trayful is one bundled file with a
 * `resources/` folder beside it, one folder per resource; in this repository each
 * lives in its own package. `from` is the running module's URL, and only changes in tests.
 */
export function resourceDir(resource: Resource, from: string = import.meta.url): string {
  const packaged = fileURLToPath(new URL(`resources/${resource}`, from));
  return existsSync(packaged)
    ? packaged
    : fileURLToPath(new URL(REPOSITORY_ROOT + RESOURCE_SOURCES[resource], from));
}

/**
 * The version of a packaged Trayful, read from the package.json beside its bundled
 * file; nothing when running from this repository.
 */
export function packagedVersion(from: string = import.meta.url): string | undefined {
  const manifest = fileURLToPath(new URL('package.json', from));
  if (!existsSync(manifest)) return undefined;
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}
