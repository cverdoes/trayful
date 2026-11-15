/**
 * The user half of the site: the Markdown in `docs/` (the user guide, the HOWTO guides
 * and the format reference) and the landing page that leads into both halves. Links
 * between these pages stay in the site, pictures are copied into it, and links to
 * anything else in the repository go to GitHub.
 */
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';
import { esc, inline, link, markdown, type Page } from './html.js';
import { pagePath } from './links.js';
import { DOC_SECTIONS, type DocPage, type DocSection, type Model } from './model.js';
import { sourceUrl } from './pages-code.js';

const DOCS = 'docs';

/** Where the site keeps copies of the pictures the docs show, by repository path. */
const FILES = 'files';

/** The screenshot on the landing page. */
const SCREENSHOT = '.github/readme/table.png';

/** The pages a folder's `README.md` links to, in the order it lists them. */
function readingOrder(readme: string): string[] {
  return [...readme.matchAll(/\]\(([\w-]+\.md)\)/g)].map((m) => m[1]!);
}

async function readSection(section: DocSection): Promise<DocPage[]> {
  const dir = path.join(ROOT, DOCS, section);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const texts = new Map(
    await Promise.all(
      files.map(async (f) => [f, await readFile(path.join(dir, f), 'utf8')] as const),
    ),
  );
  const order = ['README.md', ...readingOrder(texts.get('README.md') ?? '')];
  const rank = (f: string) => (order.includes(f) ? order.indexOf(f) : order.length);
  return files
    .toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((f) => {
      const text = texts.get(f)!;
      const title = /^# (.+)$/m.exec(text)?.[1] ?? f;
      return { path: `${section}/${f}`, section, title, markdown: text };
    });
}

/** Every page of the user guide, the HOWTO guides and the format reference. */
export async function readDocs(): Promise<DocPage[]> {
  return (await Promise.all(DOC_SECTIONS.map(readSection))).flat();
}

/** A relative link in a page in `docs/` as a repository path, or undefined for a URL or an anchor. */
function inRepository(page: DocPage, href: string): { file: string; hash: string } | undefined {
  if (/^([a-z]+:|#)/.test(href)) return undefined;
  const [target = '', hash = ''] = href.split('#');
  const file = path.posix.normalize(path.posix.join(DOCS, path.posix.dirname(page.path), target));
  return { file, hash: hash ? `#${hash}` : '' };
}

/** Where a link in a page in `docs/` goes in the site: another page, or the file on GitHub. */
function docHref(model: Model, page: DocPage, href: string): string {
  const found = inRepository(page, href);
  if (!found) return href;
  const doc = found.file.slice(DOCS.length + 1);
  if (found.file === `${DOCS}/README.md`) return `../${pagePath.index()}`;
  if (model.docs.some((d) => d.path === doc)) return `../${pagePath.doc(doc)}${found.hash}`;
  return sourceUrl(model, found.file) + found.hash;
}

/** The repository paths of the pictures the docs and the landing page show. */
function docImages(model: Model): string[] {
  const images = model.docs.flatMap((page) =>
    [...page.markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].flatMap(
      (m) => inRepository(page, m[1]!)?.file ?? [],
    ),
  );
  return [...new Set([SCREENSHOT, ...images])];
}

/** Copies the pictures the docs show into the site, where their pages expect them. */
export async function copyDocImages(model: Model, out: string): Promise<void> {
  for (const image of docImages(model)) {
    const target = path.join(out, FILES, image);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(ROOT, image), target);
  }
}

export function docPages(model: Model): Page[] {
  return model.docs.map((page) => ({
    path: pagePath.doc(page.path),
    title: page.title,
    body: markdown(page.markdown, {
      prefix: '../',
      rewrite: (href) => docHref(model, page, href),
      image: (src) => {
        const found = inRepository(page, src);
        return found ? `../${FILES}/${found.file}` : src;
      },
    }),
  }));
}

function door(title: string, lead: string, links: [string, string][]): string {
  const items = links.map(([href, label]) => `<li>${link('', href, esc(label))}</li>`).join('');
  return `<section class="door"><h2>${title}</h2><p>${inline(lead)}</p><ul>${items}</ul></section>`;
}

/** The landing page: what Trayful is, and a door into each half of the site. */
export function landingPage(model: Model): Page {
  const guide = model.docs.filter((d) => d.section === 'guide' && !d.path.endsWith('README.md'));
  const users = door(
    link('', pagePath.doc('guide/README.md'), 'User guide'),
    'Make and play prototypes with the `trayful` package from npm: install it, build your components, playtest with others and let agents play.',
    [
      ...guide.map((d): [string, string] => [pagePath.doc(d.path), d.title]),
      [pagePath.doc('howto/README.md'), 'HOWTO guides'],
      [pagePath.doc('reference/README.md'), 'Format reference'],
    ],
  );
  const contributing = model.concepts.filter((c) => c.kind === 'contributing');
  const contributors = door(
    link('', pagePath.contributors(), 'Contributors'),
    'Work on Trayful itself: build it from a clone, the checks a change must pass, and how it is built and why.',
    [
      ...contributing.map((c): [string, string] => [pagePath.concept(c.slug), c.title]),
      [pagePath.contributors(), 'Architecture overview'],
    ],
  );
  const body = `<h1>Trayful</h1>
<p class="lead">Where your games come together: a boardgame prototyping table for people and AI agents.</p>
<p>Describe your components (cards, boards, tokens, meeples, dice, counters) in plain YAML files, or design them in the browser, and Trayful lays them out on a table where people and AI agents can drag, flip, rotate, stack and shuffle them.</p>
<pre><code>npx trayful new my-game
npx trayful play my-game</code></pre>
<div class="doors">${users}${contributors}</div>
<img class="hero" src="${FILES}/${SCREENSHOT}" alt="A game of Harvest Moon on the Trayful table: a board with a card market, fields with workers, a supply with dice and coins, a score track, a draw deck and a hand of cards">`;
  return { path: pagePath.index(), title: 'Trayful', body };
}
