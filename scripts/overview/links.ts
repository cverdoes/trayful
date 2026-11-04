/**
 * Symbol links: concept pages write `[[core:TableState]]` instead of a path, and this
 * resolves each one to a page in the site and the module it is about. An unknown link is
 * an error, so renaming code without updating the pages that explain it fails the check.
 */
import { KEY_TYPES } from './config.js';
import type { Model } from './model.js';

interface Target {
  /** Path from the site root, with an anchor when it points into a page. */
  href: string;
  label: string;
  /** The module the link is about, for "takes part in". */
  module?: string;
}

/** Where each page lives, from the site root. */
export const pagePath = {
  index: () => 'index.html',
  pkg: (name: string) => `packages/${name}.html`,
  module: (id: string) => `modules/${id.replaceAll('/', '.')}.html`,
  type: (name: string) => `types/${name}.html`,
  // `index.md` is the home page's introduction.
  concept: (slug: string) => (slug === 'index' ? 'index.html' : `concepts/${slug}.html`),
  reference: (slug: string) => `formats/${slug}.html`,
  surface: (name: 'commands' | 'protocol' | 'mcp' | 'routes' | 'cli' | 'formats') =>
    `surfaces/${name}.html`,
};

export type Registry = Map<string, Target>;

function addModules(registry: Registry, model: Model): void {
  const keyTypes = new Set(KEY_TYPES);
  for (const pkg of model.packages) {
    registry.set(pkg.name, { href: pagePath.pkg(pkg.name), label: pkg.npmName });
  }
  for (const m of model.modules) {
    const target = { href: pagePath.module(m.id), label: m.id, module: m.id };
    registry.set(m.id, target);
    // A module may be named without its extension: `core/engine`.
    registry.set(m.id.replace(/\.tsx?$/, ''), target);
    for (const d of m.decls) {
      const key = `${m.pkg}:${d.name}`;
      // Exported declarations win over private ones of the same name.
      if (registry.has(key) && !d.exported) continue;
      const href = keyTypes.has(key) ? pagePath.type(d.name) : `${pagePath.module(m.id)}#${d.name}`;
      registry.set(key, { href, label: d.name, module: m.id });
    }
  }
}

function addVariants(registry: Registry, model: Model): void {
  const variantsOf = (pkg: string, name: string) =>
    model.modules
      .filter((m) => m.pkg === pkg)
      .flatMap((m) => m.decls.filter((d) => d.name === name).map((d) => ({ m, d })))[0];
  const commands = variantsOf('core', 'Command');
  for (const v of commands?.d.variants ?? []) {
    registry.set(`command:${v.tag}`, {
      href: `${pagePath.surface('commands')}#${v.tag}`,
      label: v.tag,
      module: commands!.m.id,
    });
  }
  for (const [side, name] of [
    ['client', 'ClientMessage'],
    ['server', 'ServerMessage'],
  ] as const) {
    const found = variantsOf('core', name);
    for (const v of found?.d.variants ?? []) {
      registry.set(`message:${v.tag}`, {
        href: `${pagePath.surface('protocol')}#${side}-${v.tag}`,
        label: v.tag,
        module: found!.m.id,
      });
    }
  }
}

function addSurfaces(registry: Registry, model: Model): void {
  for (const tool of model.tools) {
    registry.set(`mcp:${tool.name}`, {
      href: `${pagePath.surface('mcp')}#${tool.name}`,
      label: tool.name,
      module: tool.group,
    });
  }
  for (const route of model.routes) {
    registry.set(`route:${route.method} ${route.path}`, {
      href: `${pagePath.surface('routes')}#${routeAnchor(route.method, route.path)}`,
      label: `${route.method} ${route.path}`,
      module: route.module,
    });
  }
  for (const command of model.cli) {
    registry.set(`trayful:${command.name}`, {
      href: `${pagePath.surface('cli')}#${command.name}`,
      label: `trayful ${command.name}`,
      module: 'cli/index.ts',
    });
  }
  for (const page of model.reference) {
    registry.set(`format:${page.slug}`, { href: pagePath.reference(page.slug), label: page.title });
  }
  for (const concept of model.concepts) {
    registry.set(`concept:${concept.slug}`, {
      href: pagePath.concept(concept.slug),
      label: concept.title,
    });
  }
}

export function routeAnchor(method: string, path: string): string {
  return `${method}-${path}`.replace(/[^\w-]+/g, '-').toLowerCase();
}

/** Every name a concept page may link to. */
export function buildRegistry(model: Model): Registry {
  const registry: Registry = new Map();
  addModules(registry, model);
  addVariants(registry, model);
  addSurfaces(registry, model);
  return registry;
}

/** `[[name]]` or `[[name|label]]`; inside a Markdown table the bar is written `\|`. */
export const LINK = /\[\[([^[\]]+)\]\]/g;

/** Splits what is between the brackets into the name and an optional label. */
export function parseLink(inside: string): { name: string; label?: string } {
  const bar = inside.indexOf('|');
  if (bar < 0) return { name: inside.trim() };
  const name = inside.slice(0, inside[bar - 1] === '\\' ? bar - 1 : bar);
  return { name: name.trim(), label: inside.slice(bar + 1).trim() };
}

/** The names a page links to, in order of appearance. */
export function linksIn(markdown: string): string[] {
  return [...markdown.matchAll(LINK)].map((m) => parseLink(m[1]!).name);
}
