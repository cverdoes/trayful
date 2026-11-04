/**
 * Finds every source module and how they import each other, using dependency-cruiser
 * (the same tool that enforces the layers in `pnpm lint:deps`), and reads each module's
 * declarations with `source.ts`.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cruise, type ICruiseResult, type IModule } from 'dependency-cruiser';
import { PACKAGES, ROOT } from './config.js';
import type { ModuleInfo, PackageInfo } from './model.js';
import { readSource } from './source.js';

const SOURCE = /^packages\/([^/]+)\/src\/(.+\.tsx?)$/;

/** `packages/core/src/engine.ts` → `core/engine.ts`; undefined for anything else. */
function moduleId(file: string): string | undefined {
  const match = SOURCE.exec(file);
  return match && !file.endsWith('.d.ts') ? `${match[1]}/${match[2]}` : undefined;
}

async function cruiseSources(): Promise<IModule[]> {
  const result = await cruise(
    ['packages'],
    {
      validate: false,
      doNotFollow: { path: 'node_modules' },
      exclude: { path: '(^|/)(dist|coverage|schema|node_modules|test)/' },
      tsPreCompilationDeps: true,
      combinedDependencies: true,
      enhancedResolveOptions: {
        exportsFields: ['exports'],
        conditionNames: ['import', 'node', 'default', 'types'],
        mainFields: ['module', 'main', 'types'],
        extensions: ['.ts', '.tsx', '.js'],
      },
    },
    undefined,
    { tsConfig: { fileName: path.join(ROOT, 'tsconfig.json') } },
  );
  return (result.output as ICruiseResult).modules;
}

function externalName(dep: IModule['dependencies'][number]): string | undefined {
  if (dep.coreModule) return dep.module;
  if (!dep.dependencyTypes.some((t) => t.startsWith('npm'))) return undefined;
  const parts = dep.module.split('/');
  return dep.module.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

async function readModule(found: IModule, id: string): Promise<ModuleInfo> {
  const text = await readFile(path.join(ROOT, found.source), 'utf8');
  const { purpose, decls } = readSource(found.source, text);
  const imports = new Set<string>();
  const external = new Set<string>();
  for (const dep of found.dependencies) {
    const target = moduleId(dep.resolved);
    if (target && target !== id) imports.add(target);
    const name = target ? undefined : externalName(dep);
    if (name) external.add(name);
  }
  return {
    id,
    pkg: id.split('/')[0]!,
    path: found.source,
    purpose,
    lines: text.split('\n').length,
    decls,
    imports: [...imports].sort((a, b) => a.localeCompare(b)),
    importedBy: [],
    external: [...external].sort((a, b) => a.localeCompare(b)),
  };
}

/** Every source module in `packages/*\/src`, with imports both ways. */
export async function readModules(): Promise<ModuleInfo[]> {
  const modules: ModuleInfo[] = [];
  for (const found of await cruiseSources()) {
    const id = moduleId(found.source);
    if (id) modules.push(await readModule(found, id));
  }
  modules.sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const m of modules) {
    for (const target of m.imports) byId.get(target)?.importedBy.push(m.id);
  }
  return modules;
}

/** The first paragraph of a README after its title. */
function readmeSummary(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim());
  const first = paragraphs.find((p) => p && !p.startsWith('#') && !p.startsWith('```'));
  return (first ?? '').replace(/\s+/g, ' ');
}

/** The packages in layer order, with their modules and which other packages they use. */
export async function readPackages(modules: ModuleInfo[]): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  for (const { name, layer, column } of PACKAGES) {
    const dir = path.join(ROOT, 'packages', name);
    const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as {
      name: string;
    };
    const own = modules.filter((m) => m.pkg === name);
    const uses: Record<string, number> = {};
    for (const m of own) {
      for (const target of m.imports) {
        const other = target.split('/')[0]!;
        if (other !== name) uses[other] = (uses[other] ?? 0) + 1;
      }
    }
    packages.push({
      name,
      npmName: manifest.name,
      summary: readmeSummary(await readFile(path.join(dir, 'README.md'), 'utf8')),
      layer,
      column,
      modules: own.map((m) => m.id),
      uses,
    });
  }
  return packages;
}
