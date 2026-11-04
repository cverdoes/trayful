/**
 * Pages about the code itself: the home page, one page per package, one per module and
 * one per key type.
 */
import { KEY_TYPES, REPO_URL } from './config.js';
import { esc, inline, link, markdown, paragraphs, type Page } from './html.js';
import { layerSvg } from './layers.js';
import { pagePath, type Registry } from './links.js';
import type { Concept, Decl, Member, Model, ModuleInfo } from './model.js';
import { firstSentence } from './source.js';

/** Which concept pages mention each module, for "takes part in". */
export type Usage = Map<string, Concept[]>;

const P = '../';

export function sourceUrl(model: Model, file: string, line?: number): string {
  return `${REPO_URL}/blob/${model.commit}/${file}${line ? `#L${line}` : ''}`;
}

function moduleLink(id: string, prefix = P): string {
  return link(prefix, pagePath.module(id), `<code>${esc(id)}</code>`);
}

function takesPartIn(concepts: Concept[] | undefined, prefix = P): string {
  if (!concepts?.length) return '';
  const rank = (c: Concept) => (c.kind === 'interaction' ? 0 : 100) + c.order;
  const items = concepts
    .toSorted((a, b) => rank(a) - rank(b))
    .map((c) => `<li>${link(prefix, pagePath.concept(c.slug), esc(c.title))}</li>`);
  return `<h2>Takes part in</h2><ul>${items.join('')}</ul>`;
}

export function memberTable(members: Member[], first = 'Field'): string {
  if (members.length === 0) return '';
  const rows = members.map(
    (m) =>
      `<tr><td><code>${esc(m.name)}${m.optional ? '?' : ''}</code></td><td><code>${esc(m.type)}</code></td><td>${inline(m.doc)}</td></tr>`,
  );
  return `<table><thead><tr><th>${first}</th><th>Type</th><th>What it is</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

export function homePage(model: Model, registry: Registry): Page {
  const intro = model.concepts.find((c) => c.slug === 'index');
  const interactions = model.concepts.filter((c) => c.kind === 'interaction');
  const rows = model.packages.map(
    (p) =>
      `<tr><td>${link('', pagePath.pkg(p.name), `<code>${esc(p.npmName)}</code>`)}</td><td>${p.layer}</td><td>${p.modules.length}</td><td>${inline(p.summary)}</td></tr>`,
  );
  const walks = interactions.map(
    (c) => `<li>${link('', pagePath.concept(c.slug), esc(c.title))}: ${inline(c.summary)}</li>`,
  );
  const body = `<h1>Trayful architecture</h1>
${intro ? markdown(intro.markdown, { prefix: '', registry }) : ''}
<h2>The layers</h2>
<p>Each package may import only from the layers below it; <code>pnpm lint:deps</code> enforces this. Arrows point at what a package imports, with the number of imports.</p>
${layerSvg(model.packages)}
<table><thead><tr><th>Package</th><th>Layer</th><th>Modules</th><th>What it is</th></tr></thead><tbody>${rows.join('')}</tbody></table>
<h2>Follow an interaction</h2>
<ul>${walks.join('')}</ul>`;
  return { path: pagePath.index(), title: 'Overview', body };
}

/** The folder a module sits in inside its package's `src/`; '' for the top level. */
function folderOf(m: ModuleInfo): string {
  return m.id.split('/').slice(1, -1).join('/');
}

function moduleRows(modules: ModuleInfo[]): string {
  return modules
    .map((m) => {
      const name = m.id.split('/').at(-1)!;
      const what = m.purpose ? firstSentence(m.purpose) : '';
      return `<tr><td>${link(P, pagePath.module(m.id), `<code>${esc(name)}</code>`)}</td><td>${inline(what)}</td><td>${m.lines}</td></tr>`;
    })
    .join('');
}

/** One table per folder, the package's top level first, then its folders by name. */
function moduleSections(modules: ModuleInfo[]): string {
  const folders = [...new Set(modules.map(folderOf))].sort((a, b) => a.localeCompare(b));
  return folders
    .map((folder) => {
      const inFolder = modules.filter((m) => folderOf(m) === folder);
      const heading = folder ? `<h3><code>${esc(folder)}/</code></h3>` : '';
      return `${heading}<table class="module-table"><thead><tr><th>Module</th><th>What it is for</th><th>Lines</th></tr></thead><tbody>${moduleRows(inFolder)}</tbody></table>`;
    })
    .join('\n');
}

export function packagePage(model: Model, name: string, usage: Usage): Page {
  const pkg = model.packages.find((p) => p.name === name)!;
  const modules = model.modules.filter((m) => m.pkg === name);
  const usedBy = model.packages.filter((p) => p.uses[name]).map((p) => p.name);
  const concepts = [...new Set(modules.flatMap((m) => usage.get(m.id) ?? []))];
  const pkgLinks = (names: string[]) =>
    names.map((n) => link(P, pagePath.pkg(n), `<code>${esc(n)}</code>`)).join(', ') || 'nothing';
  const entry = modules.find((m) => m.id === `${name}/index.ts`);
  const body = `<h1><code>${esc(pkg.npmName)}</code></h1>
<p>${inline(pkg.summary)}</p>
<p>Layer ${pkg.layer}. Uses ${pkgLinks(Object.keys(pkg.uses))}. Used by ${pkgLinks(usedBy)}. <a href="${esc(sourceUrl(model, `packages/${name}/README.md`))}">README on GitHub</a>.</p>
${entry ? `<p>Entry point ${moduleLink(entry.id)} re-exports ${entry.imports.length} modules.</p>` : ''}
${takesPartIn(concepts)}
<h2>Modules</h2>
${moduleSections(modules)}`;
  return { path: pagePath.pkg(name), title: pkg.npmName, body };
}

function declRow(d: Decl, keyTypes: Set<string>, pkg: string): string {
  const name = keyTypes.has(`${pkg}:${d.name}`)
    ? link(P, pagePath.type(d.name), `<code>${esc(d.name)}</code>`)
    : `<code>${esc(d.name)}</code>`;
  return `<tr id="${esc(d.name)}"><td>${name}</td><td>${d.kind}</td><td>${inline(d.summary)}</td><td><a href="#L${d.line}">${d.line}</a></td></tr>`;
}

function declTable(decls: Decl[], pkg: string): string {
  const keyTypes = new Set(KEY_TYPES);
  return `<table><thead><tr><th>Name</th><th>Kind</th><th>What it is</th><th>Line</th></tr></thead><tbody>${decls.map((d) => declRow(d, keyTypes, pkg)).join('')}</tbody></table>`;
}

function sourceBlock(text: string): string {
  const lines = text
    .split('\n')
    .map(
      (line, i) =>
        `<span class="line" id="L${i + 1}"><span class="ln">${i + 1}</span>${esc(line)}</span>`,
    );
  return `<details class="source"><summary>Source</summary><pre><code>${lines.join('\n')}</code></pre></details>`;
}

function list(ids: string[]): string {
  return ids.length
    ? `<ul class="modules">${ids.map((id) => `<li>${moduleLink(id)}</li>`).join('')}</ul>`
    : '<p>None.</p>';
}

export function modulePage(model: Model, m: ModuleInfo, text: string, usage: Usage): Page {
  const exported = m.decls.filter((d) => d.exported);
  const inside = m.decls.filter((d) => !d.exported);
  const body = `<p class="crumbs">${link(P, pagePath.pkg(m.pkg), `<code>${esc(m.pkg)}</code>`)}</p>
<h1><code>${esc(m.id)}</code></h1>
${paragraphs(m.purpose)}
<p><code>${esc(m.path)}</code>, ${m.lines} lines. <a href="${esc(sourceUrl(model, m.path))}">On GitHub</a>.</p>
${takesPartIn(usage.get(m.id))}
${exported.length ? `<h2>Exports</h2>${declTable(exported, m.pkg)}` : ''}
${inside.length ? `<h2>Inside the module</h2>${declTable(inside, m.pkg)}` : ''}
<h2>Imports</h2>${list(m.imports)}
${m.external.length ? `<p>Also: ${m.external.map((e) => `<code>${esc(e)}</code>`).join(', ')}.</p>` : ''}
<h2>Imported by</h2>${list(m.importedBy)}
${sourceBlock(text)}`;
  return { path: pagePath.module(m.id), title: m.id, body };
}

function variantSections(d: Decl): string {
  return (d.variants ?? [])
    .map(
      (v) =>
        `<h3 id="${esc(v.tag)}"><code>${esc(v.tag)}</code></h3>${paragraphs(v.doc)}${memberTable(v.members)}`,
    )
    .join('\n');
}

export function keyTypePage(model: Model, key: string, usage: Usage): Page {
  const [pkg, name] = key.split(':') as [string, string];
  const m = model.modules.find((mod) => mod.pkg === pkg && mod.decls.some((d) => d.name === name))!;
  const d = m.decls.find((decl) => decl.name === name)!;
  const fields = d.kind === 'class' ? 'Member' : 'Field';
  const body = `<p class="crumbs">Key type in ${moduleLink(m.id)}</p>
<h1><code>${esc(name)}</code></h1>
<pre class="signature"><code>${esc(d.signature)}</code></pre>
${paragraphs(d.doc)}
<p><a href="${esc(sourceUrl(model, m.path, d.line))}">Line ${d.line} on GitHub</a> · ${link(P, `${pagePath.module(m.id)}#L${d.line}`, 'in the module source')}</p>
${takesPartIn(usage.get(m.id))}
${d.members?.length ? `<h2>${fields}s</h2>${memberTable(d.members, fields)}` : ''}
${d.variants?.length ? `<h2>Cases, by <code>type</code></h2>${variantSections(d)}` : ''}
<h2>Modules that import ${moduleLink(m.id)}</h2>${list(m.importedBy)}`;
  return { path: pagePath.type(name), title: name, body };
}
