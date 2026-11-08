/**
 * The libraries Trayful is built on, read from the `package.json` of the repository and
 * of each package. The onboarding pages say why each one is there; `--check` fails on a
 * library that no page explains, so a new dependency comes with its reason.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PACKAGES, ROOT } from './config.js';
import type { Library, ModuleInfo } from './model.js';

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Type declarations for a library explain themselves, and workspace packages have pages. */
function isLibrary(name: string, version: string): boolean {
  return !name.startsWith('@types/') && !version.startsWith('workspace:');
}

async function manifest(dir: string): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(ROOT, dir, 'package.json'), 'utf8')) as Manifest;
}

/** Every library in the repository's manifests, by name, with who declares it and how. */
export async function readLibraries(modules: ModuleInfo[]): Promise<Library[]> {
  const owners = [
    { owner: 'repository', dir: '.' },
    ...PACKAGES.map((p) => ({ owner: p.name, dir: `packages/${p.name}` })),
  ];
  const byName = new Map<string, Library>();
  for (const { owner, dir } of owners) {
    const { dependencies = {}, devDependencies = {} } = await manifest(dir);
    const declared = [
      ...Object.entries(dependencies).map(([name, version]) => ({ name, version, dev: false })),
      ...Object.entries(devDependencies).map(([name, version]) => ({ name, version, dev: true })),
    ];
    for (const { name, version, dev } of declared.filter((d) => isLibrary(d.name, d.version))) {
      const library = byName.get(name) ?? { name, version, usedBy: [], importedBy: [] };
      library.usedBy.push({ owner, dev });
      byName.set(name, library);
    }
  }
  for (const library of byName.values()) {
    library.importedBy = modules.filter((m) => m.external.includes(library.name)).map((m) => m.id);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
