/**
 * Builds the overview: reads everything into a `Model`, checks the hand-written pages
 * against it, and writes the HTML site.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SITE_CSS, SITE_JS } from './assets.js';
import { currentCommit, lastChanged, readConcepts } from './concepts.js';
import { KEY_TYPES, ROOT } from './config.js';
import { readLibraries } from './dependencies.js';
import { frame, type Page } from './html.js';
import { buildRegistry, linksIn, pagePath, type Registry } from './links.js';
import type { Model } from './model.js';
import { readModules, readPackages } from './modules.js';
import { homePage, keyTypePage, modulePage, packagePage, type Usage } from './pages-code.js';
import {
  cliPage,
  commandsPage,
  conceptPage,
  formatsPage,
  librariesPage,
  mcpPage,
  protocolPage,
  referencePages,
  routesPage,
} from './pages-surfaces.js';
import { readCli, readReference, readRoutes, readTools } from './surfaces.js';

/** Reads the source, the running MCP server and CLI, and the pages in `architecture/`. */
export async function buildModel(): Promise<Model> {
  const modules = await readModules();
  const [packages, tools, routes, cli, reference, libraries, concepts] = await Promise.all([
    readPackages(modules),
    readTools(),
    readRoutes(modules),
    readCli(),
    readReference(),
    readLibraries(modules),
    readConcepts(),
  ]);
  const model: Model = {
    generatedAt: new Date().toISOString(),
    commit: currentCommit(),
    packages,
    modules,
    keyTypes: KEY_TYPES,
    tools,
    routes,
    cli,
    reference,
    libraries,
    concepts,
    changed: {},
  };
  const registry = buildRegistry(model);
  const explained = concepts.flatMap((c) =>
    linksIn(c.markdown).flatMap((n) => {
      const id = registry.get(n)?.module;
      return modules.find((m) => m.id === id)?.path ?? [];
    }),
  );
  model.changed = lastChanged([...explained, ...concepts.map((c) => c.path)]);
  return model;
}

/** Which concept pages link into each module. */
function usageOf(model: Model, registry: Registry): Usage {
  const usage: Usage = new Map();
  for (const concept of model.concepts) {
    const modules = new Set(
      linksIn(concept.markdown).flatMap((n) => registry.get(n)?.module ?? []),
    );
    for (const id of modules) usage.set(id, [...(usage.get(id) ?? []), concept]);
  }
  return usage;
}

/** Symbol links in `architecture/` that name nothing, and key types that are gone. */
function brokenLinks(model: Model, registry: Registry): string[] {
  const broken = model.concepts.flatMap((c) =>
    linksIn(c.markdown)
      .filter((name) => !registry.has(name))
      .map((name) => `${c.path}: [[${name}]] names nothing in the code.`),
  );
  const gone = model.keyTypes
    .filter((key) => !registry.has(key))
    .map((key) => `scripts/overview/config.ts: key type ${key} is gone.`);
  return [...broken, ...gone];
}

/** Libraries that no page in `architecture/` gives a reason for. */
function unexplainedLibraries(model: Model): string[] {
  const named = new Set(model.concepts.flatMap((c) => linksIn(c.markdown)));
  return model.libraries
    .filter((library) => !named.has(`npm:${library.name}`))
    .map(
      (library) =>
        `architecture/: no page says why Trayful uses ${library.name}; link it as [[npm:${library.name}]].`,
    );
}

/** Source files that do not say what they are for, and packages no page explains. */
function gaps(model: Model, registry: Registry): string[] {
  const usage = usageOf(model, registry);
  const unexplained = model.modules
    .filter((m) => !m.purpose)
    .map((m) => `${m.path}: say what the file is for in a doc comment at its top.`);
  const unvisited = model.packages
    .filter((pkg) => !pkg.modules.some((id) => usage.has(id)))
    .map((pkg) => `architecture/: no page explains any module of ${pkg.npmName}.`);
  const walkthroughs = model.concepts.some((c) => c.kind === 'interaction')
    ? []
    : ['architecture/: there is no interaction walkthrough.'];
  return [...unexplained, ...unvisited, ...walkthroughs];
}

/** Everything that makes the overview wrong or incomplete; empty when it is fine. */
export function checkModel(model: Model): string[] {
  const registry = buildRegistry(model);
  return [
    ...brokenLinks(model, registry),
    ...gaps(model, registry),
    ...unexplainedLibraries(model),
  ];
}

async function pages(model: Model, registry: Registry): Promise<Page[]> {
  const usage = usageOf(model, registry);
  const modulePages = await Promise.all(
    model.modules.map(async (m) =>
      modulePage(model, m, await readFile(path.join(ROOT, m.path), 'utf8'), usage),
    ),
  );
  return [
    homePage(model, registry),
    ...model.packages.map((p) => packagePage(model, p.name, usage)),
    ...modulePages,
    ...model.keyTypes.map((k) => keyTypePage(model, k, usage)),
    commandsPage(model),
    protocolPage(model),
    mcpPage(model),
    routesPage(model),
    cliPage(model),
    formatsPage(model),
    librariesPage(model),
    ...referencePages(model),
    ...model.concepts.filter((c) => c.slug !== 'index').map((c) => conceptPage(c, model, registry)),
  ];
}

interface SearchEntry {
  /** Title, URL from the site root, kind, and a line of summary. */
  t: string;
  u: string;
  k: string;
  s: string;
}

function searchIndex(model: Model, list: Page[], registry: Registry): SearchEntry[] {
  const entries: SearchEntry[] = list.map((p) => ({ t: p.title, u: p.path, k: 'page', s: '' }));
  for (const m of model.modules) {
    for (const d of m.decls.filter((decl) => decl.exported)) {
      const target = registry.get(`${m.pkg}:${d.name}`);
      entries.push({
        t: d.name,
        u: target?.href ?? pagePath.module(m.id),
        k: `${d.kind} in ${m.id}`,
        s: d.summary ?? '',
      });
    }
  }
  for (const [name, target] of registry) {
    const [kind] = name.split(':');
    if (['mcp', 'command', 'message', 'route', 'trayful', 'npm'].includes(kind!)) {
      entries.push({ t: target.label, u: target.href, k: `${kind}`, s: '' });
    }
  }
  return entries;
}

/**
 * Empties the output folder, but only when it holds an earlier overview (or nothing), so
 * a mistyped `--out` never deletes anything else.
 */
async function clearOut(out: string): Promise<void> {
  const entries: string[] = await readdir(out).catch(() => []);
  if (entries.length > 0 && !entries.includes('model.json')) {
    throw new Error(`${out} is not empty and holds no earlier overview; pick another --out.`);
  }
  await rm(out, { recursive: true, force: true });
}

/** Writes the site to `out`, replacing an earlier overview there. */
export async function writeSite(model: Model, out: string): Promise<number> {
  const registry = buildRegistry(model);
  const list = await pages(model, registry);
  await clearOut(out);
  for (const page of list) {
    const file = path.join(out, page.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, frame(page, model));
  }
  await mkdir(path.join(out, 'assets'), { recursive: true });
  await writeFile(path.join(out, 'assets/site.css'), SITE_CSS);
  await writeFile(path.join(out, 'assets/site.js'), SITE_JS);
  const index = JSON.stringify(searchIndex(model, list, registry));
  await writeFile(path.join(out, 'assets/search-index.js'), `window.TRAYFUL_INDEX = ${index};\n`);
  await writeFile(path.join(out, 'model.json'), JSON.stringify(model, null, 2));
  return list.length;
}
