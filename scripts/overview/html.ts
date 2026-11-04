/**
 * The site's page frame and HTML helpers: escaping, Markdown, the navigation and the
 * links between pages. Every page except the home page sits one folder down, so a
 * link from the site root only needs the page's prefix in front.
 */
import { Marked, type Tokens } from 'marked';
import { LINK, pagePath, parseLink, type Registry } from './links.js';
import type { Model } from './model.js';

export function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Inline code from doc comments: `x` becomes <code>x</code>, everything else escaped. */
export function inline(text: string | undefined): string {
  return esc(text ?? '').replace(/`([^`]+)`/g, '<code>$1</code>');
}

function oneLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join(' ');
}

/** A doc comment as paragraphs. */
export function paragraphs(text: string | undefined): string {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p>${inline(oneLine(p))}</p>`)
    .join('\n');
}

export interface MarkdownOptions {
  /** Prefix from the page to the site root, such as `../`. */
  prefix: string;
  registry?: Registry;
  /** Changes link targets, such as `library.md` into `library.html`. */
  rewrite?: (href: string) => string;
}

/** Replaces `[[name]]` and `[[name|label]]` with Markdown links; unknown names stay as they are. */
export function resolveLinks(markdown: string, registry: Registry, prefix: string): string {
  return markdown.replace(LINK, (whole, inside: string) => {
    const { name, label } = parseLink(inside);
    const target = registry.get(name);
    if (!target) return whole;
    return `[${label ?? `\`${target.label}\``}](${prefix}${target.href})`;
  });
}

export function markdown(text: string, options: MarkdownOptions): string {
  const linked = options.registry ? resolveLinks(text, options.registry, options.prefix) : text;
  const marked = new Marked({
    gfm: true,
    walkTokens: (token) => {
      if (token.type === 'link' && options.rewrite) {
        (token as Tokens.Link).href = options.rewrite((token as Tokens.Link).href);
      }
    },
  });
  return marked.parse(linked, { async: false });
}

export function link(prefix: string, href: string, label: string): string {
  return `<a href="${esc(prefix + href)}">${label}</a>`;
}

export interface Page {
  /** Path from the site root. */
  path: string;
  title: string;
  body: string;
}

function navSection(title: string, items: string[]): string {
  return `<h2>${title}</h2><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

function nav(model: Model, prefix: string): string {
  const to = (href: string, label: string) => link(prefix, href, esc(label));
  const interactions = model.concepts.filter((c) => c.kind === 'interaction');
  // `index.md` is the home page's introduction, not a page of its own.
  const concepts = model.concepts.filter((c) => c.kind === 'concept' && c.slug !== 'index');
  return [
    `<p class="brand">${to(pagePath.index(), 'Trayful architecture')}</p>`,
    '<input id="search" type="search" placeholder="Search pages and symbols" aria-label="Search">',
    '<ol id="results" hidden></ol>',
    navSection(
      'Interactions',
      interactions.map((c) => to(pagePath.concept(c.slug), c.title)),
    ),
    navSection(
      'Concepts',
      concepts.map((c) => to(pagePath.concept(c.slug), c.title)),
    ),
    navSection(
      'Packages',
      model.packages.map((p) => to(pagePath.pkg(p.name), p.npmName)),
    ),
    navSection(
      'Key types',
      model.keyTypes.map((k) => to(pagePath.type(k.split(':')[1]!), k.split(':')[1]!)),
    ),
    navSection('Surfaces', [
      to(pagePath.surface('commands'), 'Table commands'),
      to(pagePath.surface('protocol'), 'Wire protocol'),
      to(pagePath.surface('mcp'), 'MCP tools'),
      to(pagePath.surface('routes'), 'HTTP routes'),
      to(pagePath.surface('cli'), 'CLI commands'),
      to(pagePath.surface('formats'), 'File formats'),
    ]),
  ].join('\n');
}

/** A whole HTML document: navigation on the left, the page on the right. */
export function frame(page: Page, model: Model): string {
  const prefix = page.path.includes('/') ? '../' : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · Trayful architecture</title>
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body data-root="${prefix}">
<nav>${nav(model, prefix)}</nav>
<main>
${page.body}
<footer>Generated from <code>${esc(model.commit.slice(0, 12))}</code> on ${esc(model.generatedAt.slice(0, 10))} by <code>pnpm docs:overview</code>.</footer>
</main>
<script src="${prefix}assets/search-index.js"></script>
<script src="${prefix}assets/site.js"></script>
</body>
</html>
`;
}
