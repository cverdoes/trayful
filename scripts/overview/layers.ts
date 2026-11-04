/**
 * The home page's picture: the packages in their layers, with an arrow for every
 * package that imports another and how many imports there are. Drawn as inline SVG
 * from the import graph, so a new dependency shows up at once.
 */
import { esc } from './html.js';
import { pagePath } from './links.js';
import type { PackageInfo } from './model.js';

const WIDTH = 680;
const MARGIN = 48;
const BOX_W = 190;
const BOX_H = 60;
const ROW = 120;
/** The left-hand channel that arrows skipping past a box run down. */
const CHANNEL = 20;

interface Box {
  x: number;
  y: number;
  /** Half the width: the lowest layer spans the picture. */
  half: number;
}

function place(packages: PackageInfo[]): Map<string, Box> {
  const top = Math.max(...packages.map((p) => p.layer));
  const boxes = new Map<string, Box>();
  for (const p of packages) {
    const y = 40 + (top - p.layer) * ROW;
    boxes.set(
      p.name,
      p.layer === 0
        ? { x: WIDTH / 2, y, half: WIDTH / 2 - MARGIN }
        : { x: MARGIN + p.column * (WIDTH - 2 * MARGIN), y, half: BOX_W / 2 },
    );
  }
  return boxes;
}

/** Whether a straight drop at `x` from one box to another would cross some box between. */
function blocked(x: number, from: Box, to: Box, boxes: Box[]): boolean {
  return boxes.some(
    (b) => b !== from && b !== to && b.y > from.y && b.y < to.y && Math.abs(b.x - x) < b.half + 8,
  );
}

interface Edge {
  d: string;
  label: { x: number; y: number; anchor?: 'end' };
}

/**
 * An arrow to the lowest layer drops straight down; one that would cross a box runs
 * down the left-hand channel instead. Any other arrow is a straight line.
 */
function route(from: Box, to: Box, boxes: Box[]): Edge {
  const startY = from.y + BOX_H / 2;
  const endY = to.y - BOX_H / 2;
  if (to.half > BOX_W) {
    if (!blocked(from.x, from, to, boxes)) {
      return { d: `M${from.x} ${startY}V${endY}`, label: { x: from.x + 8, y: endY - 14 } };
    }
    const side = from.x - from.half;
    return {
      d: `M${side} ${from.y}H${CHANNEL}V${to.y}H${to.x - to.half}`,
      label: { x: CHANNEL + 6, y: (from.y + to.y) / 2 },
    };
  }
  // The label sits on the outer side of a slanting line, away from its neighbours.
  const right = to.x < from.x;
  return {
    d: `M${from.x} ${startY}L${to.x} ${endY}`,
    label: {
      x: (from.x + to.x) / 2 + (right ? 10 : -10),
      y: (startY + endY) / 2 + 12,
      anchor: right ? undefined : 'end',
    },
  };
}

function box(p: PackageInfo, at: Box): string {
  return `<a href="${pagePath.pkg(p.name)}"><g class="box">
<rect x="${at.x - at.half}" y="${at.y - BOX_H / 2}" width="${at.half * 2}" height="${BOX_H}" rx="8"/>
<text x="${at.x}" y="${at.y - 4}" class="name">${esc(p.npmName)}</text>
<text x="${at.x}" y="${at.y + 16}" class="note">${p.modules.length} modules</text>
</g></a>`;
}

/** The layer picture for the home page. */
export function layerSvg(packages: PackageInfo[]): string {
  const boxes = place(packages);
  const all = [...boxes.values()];
  const height = Math.max(...all.map((b) => b.y)) + BOX_H / 2 + 20;
  const edges = packages.flatMap((p) =>
    Object.entries(p.uses).map(([other, count]) => {
      const { d, label } = route(boxes.get(p.name)!, boxes.get(other)!, all);
      const words = `${count} import${count === 1 ? '' : 's'}`;
      const anchor = label.anchor ? ` text-anchor="${label.anchor}"` : '';
      return `<path d="${d}" class="edge" marker-end="url(#arrow)"/><text x="${label.x}" y="${label.y}"${anchor} class="edge-label">${words}</text>`;
    }),
  );
  return `<svg class="layers" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="Packages by layer; arrows point at what each package imports">
<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrowhead"/></marker></defs>
${edges.join('\n')}
${packages.map((p) => box(p, boxes.get(p.name)!)).join('\n')}
</svg>`;
}
