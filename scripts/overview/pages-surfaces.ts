/**
 * Pages about the ways into Trayful (table commands, the wire protocol, MCP tools, HTTP
 * routes, the CLI, the file formats and the libraries) and the hand-written concept pages.
 */
import { esc, inline, link, markdown, paragraphs, type Page } from './html.js';
import { libraryAnchor, linksIn, pagePath, routeAnchor, type Registry } from './links.js';
import type { Concept, Decl, Library, Model } from './model.js';
import { memberTable, sourceUrl } from './pages-code.js';

const P = '../';

function findDecl(model: Model, pkg: string, name: string) {
  for (const m of model.modules.filter((mod) => mod.pkg === pkg)) {
    const d = m.decls.find((decl) => decl.name === name);
    if (d) return { m, d };
  }
  throw new Error(`The overview needs ${pkg}:${name}, which is gone.`);
}

function cases(model: Model, d: Decl, file: string, prefix: string): string {
  return (d.variants ?? [])
    .map(
      (v) => `<section class="case" id="${esc(prefix + v.tag)}"><h3><code>${esc(v.tag)}</code></h3>
${paragraphs(v.doc) || '<p class="quiet">No doc comment.</p>'}
${memberTable(v.members)}
<p class="quiet"><a href="${esc(sourceUrl(model, file, v.line))}">Line ${v.line}</a></p></section>`,
    )
    .join('\n');
}

export function commandsPage(model: Model): Page {
  const { m, d } = findDecl(model, 'core', 'Command');
  const body = `<h1>Table commands</h1>
${paragraphs(d.doc)}
<p>Defined as ${link(P, pagePath.type('Command'), '<code>Command</code>')} in ${link(P, pagePath.module(m.id), `<code>${m.id}</code>`)}; applied by <code>applyCommand</code>, which the ${link(P, pagePath.type('TableEngine'), '<code>TableEngine</code>')} calls for every change.</p>
<p>${(d.variants ?? []).map((v) => `<a href="#${esc(v.tag)}"><code>${esc(v.tag)}</code></a>`).join(' · ')}</p>
${cases(model, d, m.path, '')}`;
  return { path: pagePath.surface('commands'), title: 'Table commands', body };
}

export function protocolPage(model: Model): Page {
  const client = findDecl(model, 'core', 'ClientMessage');
  const server = findDecl(model, 'core', 'ServerMessage');
  const body = `<h1>Wire protocol</h1>
${paragraphs(client.d.doc)}
<p>Both message types live in ${link(P, pagePath.module(client.m.id), `<code>${client.m.id}</code>`)}. The browser connects to <code>/ws</code>; the server side is ${link(P, pagePath.module('server/routes/socket.ts'), '<code>server/routes/socket.ts</code>')}.</p>
<h2>Browser to server: <code>ClientMessage</code></h2>
${cases(model, client.d, client.m.path, 'client-')}
<h2>Server to browser: <code>ServerMessage</code></h2>
${paragraphs(server.d.doc)}
${cases(model, server.d, server.m.path, 'server-')}`;
  return { path: pagePath.surface('protocol'), title: 'Wire protocol', body };
}

export function mcpPage(model: Model): Page {
  const groups = [...new Set(model.tools.map((t) => t.group))];
  const sections = groups.map((group) => {
    const purpose = model.modules.find((m) => m.id === group)?.purpose;
    const tools = model.tools.filter((t) => t.group === group);
    return `<h2>${link(P, pagePath.module(group), `<code>${esc(group)}</code>`)}</h2>
${paragraphs(purpose)}
${tools
  .map(
    (
      t,
    ) => `<section class="case" id="${esc(t.name)}"><h3><code>${esc(t.name)}</code>${t.title ? ` <span class="quiet">${esc(t.title)}</span>` : ''}</h3>
${paragraphs(t.description)}
${memberTable(t.inputs, 'Input')}</section>`,
  )
  .join('\n')}`;
  });
  const body = `<h1>MCP tools</h1>
<p>${model.tools.length} tools, listed from a running MCP server. Agents reach them over stdio (<code>trayful mcp</code>) or HTTP at <code>/mcp</code>; ${link(P, pagePath.module('server/mcp/server.ts'), '<code>server/mcp/server.ts</code>')} builds the server.</p>
<p>${model.tools.map((t) => `<a href="#${esc(t.name)}"><code>${esc(t.name)}</code></a>`).join(' · ')}</p>
${sections.join('\n')}`;
  return { path: pagePath.surface('mcp'), title: 'MCP tools', body };
}

export function routesPage(model: Model): Page {
  const rows = model.routes.map(
    (r) =>
      `<tr id="${routeAnchor(r.method, r.path)}"><td><code>${r.method}</code></td><td><code>${esc(r.path)}</code></td><td>${link(P, `${pagePath.module(r.module)}#L${r.line}`, `<code>${esc(r.module.replace('server/routes/', ''))}</code>:${r.line}`)}</td><td>${inline(r.doc)}</td></tr>`,
  );
  const body = `<h1>HTTP routes</h1>
<p>${model.routes.length} routes, found in the route modules under ${link(P, pagePath.module('server/server.ts'), '<code>server/server.ts</code>')}, which registers them. The description is the doc of the function that registers each group.</p>
<table><thead><tr><th>Method</th><th>Path</th><th>Where</th><th>Group</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  return { path: pagePath.surface('routes'), title: 'HTTP routes', body };
}

export function cliPage(model: Model): Page {
  const sections = model.cli.map(
    (c) =>
      `<section class="case" id="${esc(c.name)}"><h2><code>${esc(c.usage)}</code></h2><pre>${esc(c.text.trim())}</pre></section>`,
  );
  const body = `<h1>CLI commands</h1>
<p>From <code>trayful help</code>. ${link(P, pagePath.module('cli/index.ts'), '<code>cli/index.ts</code>')} sends each command to its module.</p>
${sections.join('\n')}`;
  return { path: pagePath.surface('cli'), title: 'CLI commands', body };
}

function libraryRow(library: Library, model: Model): string {
  const owners = library.usedBy
    .map((u) => (u.dev ? `${esc(u.owner)} <span class="quiet">(dev)</span>` : esc(u.owner)))
    .join(', ');
  const shown = library.importedBy
    .slice(0, 3)
    .map((id) => link(P, pagePath.module(id), `<code>${esc(id)}</code>`));
  const more = library.importedBy.length - shown.length;
  const imported =
    [...shown, ...(more > 0 ? [`and ${more} more`] : [])].join(', ') ||
    '<span class="quiet">no source module</span>';
  const why = model.concepts
    .filter((c) => linksIn(c.markdown).includes(`npm:${library.name}`))
    .map((c) => link(P, pagePath.concept(c.slug), esc(c.title)))
    .join(', ');
  const npm = `<a href="https://www.npmjs.com/package/${esc(library.name)}"><code>${esc(library.name)}</code></a>`;
  return `<tr id="${libraryAnchor(library.name)}"><td>${npm}</td><td><code>${esc(library.version)}</code></td><td>${owners}</td><td>${imported}</td><td>${why}</td></tr>`;
}

function libraryTable(libraries: Library[], model: Model): string {
  const rows = libraries.map((library) => libraryRow(library, model)).join('');
  return `<table><thead><tr><th>Library</th><th>Version</th><th>Declared by</th><th>Imported by</th><th>Explained in</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function librariesPage(model: Model): Page {
  const runtime = model.libraries.filter((l) => l.usedBy.some((u) => !u.dev));
  const tooling = model.libraries.filter((l) => l.usedBy.every((u) => u.dev));
  const body = `<h1>Libraries</h1>
<p>Every library in the repository's <code>package.json</code> files, besides type declarations. ${link(P, pagePath.concept('technology'), 'The technology page')} says why each one is there; <code>pnpm docs:overview --check</code> fails on a library no page explains.</p>
<h2>In the running product</h2>
${libraryTable(runtime, model)}
<h2>For building, testing and checking</h2>
${libraryTable(tooling, model)}`;
  return { path: pagePath.surface('libraries'), title: 'Libraries', body };
}

/** Links between reference pages stay in the site; links elsewhere go to GitHub. */
function referenceHref(model: Model, href: string): string {
  if (/^[a-z-]+\.md(#.*)?$/.test(href)) return href.replace('.md', '.html');
  if (/^(https?:|#)/.test(href)) return href;
  const target = new URL(href, 'https://x/docs/reference/').pathname.slice(1);
  return sourceUrl(model, target);
}

export function referencePages(model: Model): Page[] {
  return model.reference.map((r) => ({
    path: pagePath.reference(r.slug),
    title: r.title,
    body: markdown(r.markdown, { prefix: P, rewrite: (href) => referenceHref(model, href) }),
  }));
}

export function formatsPage(model: Model): Page {
  const items = model.reference.map(
    (r) => `<li>${link(P, pagePath.reference(r.slug), esc(r.title))}</li>`,
  );
  const body = `<h1>File formats</h1>
<p>A project is a folder of YAML files. Their schemas are Zod schemas in ${link(P, pagePath.pkg('formats'), '<code>@trayful/formats</code>')}; <code>pnpm generate</code> turns them into JSON Schema and into these reference pages, and CI checks they are current.</p>
<ul>${items.join('')}</ul>`;
  return { path: pagePath.surface('formats'), title: 'File formats', body };
}

function explains(concept: Concept, model: Model, registry: Registry): string {
  const modules = [
    ...new Set(linksIn(concept.markdown).flatMap((n) => registry.get(n)?.module ?? [])),
  ];
  if (modules.length === 0) return '';
  const rows = modules.map((id) => {
    const file = model.modules.find((m) => m.id === id)?.path ?? '';
    return `<tr><td>${link(P, pagePath.module(id), `<code>${esc(id)}</code>`)}</td><td>${esc(model.changed[file] ?? '')}</td></tr>`;
  });
  return `<details class="explains"><summary>Explains ${modules.length} modules; this page last changed ${esc(model.changed[concept.path] ?? 'now')}</summary>
<p>A module that changed after this page may have made it out of date.</p>
<table><thead><tr><th>Module</th><th>Last changed</th></tr></thead><tbody>${rows.join('')}</tbody></table></details>`;
}

export function conceptPage(concept: Concept, model: Model, registry: Registry): Page {
  const kind = { onboarding: 'Start here', interaction: 'Interaction', concept: 'Concept' }[
    concept.kind
  ];
  const body = `<p class="crumbs">${kind}</p>
<h1>${esc(concept.title)}</h1>
<p class="lead">${inline(concept.summary)}</p>
${markdown(concept.markdown, { prefix: P, registry })}
${explains(concept, model, registry)}`;
  return { path: pagePath.concept(concept.slug), title: concept.title, body };
}
