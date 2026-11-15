/**
 * The site's page frame and HTML helpers: escaping, Markdown, the navigation and the
 * links between pages. Every page except the landing and contributors pages sits one
 * folder down, so a link from the site root only needs the page's prefix in front.
 */
import { Marked, type Tokens } from 'marked';
import { LINK, pagePath, parseLink, type Registry } from './links.js';
import { DOC_SECTIONS, type Concept, type DocSection, type Model } from './model.js';

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
  /** Changes where pictures come from. */
  image?: (src: string) => string;
}

/** A heading's anchor as GitHub makes it, so links such as `versioning.md#moving-a-project` work. */
function headingId(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
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
      if (token.type === 'image' && options.image) {
        (token as Tokens.Image).href = options.image((token as Tokens.Image).href);
      }
    },
    renderer: {
      heading({ tokens, depth, text }) {
        return `<h${depth} id="${esc(headingId(text))}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
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

type Link = (href: string, label: string) => string;

function userHalf(model: Model, to: Link): string {
  const section = (name: DocSection, title: string) => {
    const pages = model.docs.filter((d) => d.section === name);
    const items = pages
      .filter((d) => !d.path.endsWith('README.md'))
      .map((d) => to(pagePath.doc(d.path), d.title));
    return navSection(to(pagePath.doc(`${name}/README.md`), title), items);
  };
  return [
    section('guide', 'User guide'),
    section('howto', 'HOWTO guides'),
    section('reference', 'Format reference'),
  ].join('\n');
}

function contributorsHalf(model: Model, to: Link): string {
  // `index.md` is the contributors home page's introduction, not a page of its own.
  const pagesOf = (kind: Concept['kind']) =>
    model.concepts
      .filter((c) => c.kind === kind && c.slug !== 'index')
      .map((c) => to(pagePath.concept(c.slug), c.title));
  return [
    navSection('Working on Trayful', [
      to(pagePath.contributors(), 'Architecture overview'),
      ...pagesOf('contributing'),
    ]),
    navSection('Start here', [
      ...pagesOf('onboarding'),
      to(pagePath.surface('libraries'), 'Libraries'),
    ]),
    navSection('Deep dive: interactions', pagesOf('interaction')),
    navSection('Concepts', pagesOf('concept')),
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

/** The pages of the user half, which open its part of the navigation. */
function isUserPage(sitePath: string): boolean {
  return DOC_SECTIONS.some((s) => sitePath.startsWith(`${s}/`));
}

/**
 * Both halves of the site, each folded away except the one the page is in; the landing
 * page opens both.
 */
function nav(model: Model, page: Page, prefix: string): string {
  const to: Link = (href, label) => link(prefix, href, esc(label));
  const landing = page.path === pagePath.index();
  const user = landing || isUserPage(page.path);
  const contributors = landing || !user;
  const half = (title: string, open: boolean, body: string) =>
    `<details class="half"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
  return [
    `<p class="brand">${to(pagePath.index(), 'Trayful')}</p>`,
    '<input id="search" type="search" placeholder="Search pages and symbols" aria-label="Search">',
    '<ol id="results" hidden></ol>',
    half('For game designers', user, userHalf(model, to)),
    half('For contributors', contributors, contributorsHalf(model, to)),
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
<title>${esc(page.title)} · Trayful</title>
<link rel="stylesheet" href="${prefix}assets/site.css">
</head>
<body data-root="${prefix}">
<nav>${nav(model, page, prefix)}</nav>
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
