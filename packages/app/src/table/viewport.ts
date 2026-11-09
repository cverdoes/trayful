import { CENTRE, type TableState } from '@trayful/core';
import { handTrayHeight } from './hand';
import { tilesFor, type Box as PageBox, type Tile } from './surfaces';
import { bounds, topLevel, type Types } from '../render/geometry';
import { shownNow, useStore, type Viewport } from '../store';

const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const MARGIN = 32;
/** How a surface nobody has looked at yet is shown: its origin in the middle. */
const EMPTY_SCALE = 2;

type Box = [number, number, number, number];

/** The rectangle `[x0, y0, x1, y1]` in mm that holds every object on a surface, or nothing when it is empty. */
export function tableBounds(table: TableState, types: Types, surface = CENTRE): Box | undefined {
  const objects = topLevel(table, surface);
  if (objects.length === 0) return undefined;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    const b = bounds(table, types, o);
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return [x0, y0, x1, y1];
}

/** Where a surface's canvas starts, before it is first fitted. */
const UNFITTED: Viewport = { x: 0, y: 0, scale: 1 };

/** A surface's viewport, as its tile's canvas shows it. */
export function viewportOf(s: { viewports: Record<string, Viewport> }, surface: string): Viewport {
  return s.viewports[surface] ?? UNFITTED;
}

/** The tiles on the page now, one for each surface shown. */
function tilesNow(): Tile[] {
  const s = useStore.getState();
  if (!s.table) return [];
  const page = { width: window.innerWidth, height: window.innerHeight, hand: handTrayHeight() };
  return tilesFor(s.table, shownNow(s), page);
}

/** The part of a tile nothing covers, in the coordinates of its own canvas. */
function clearInside(tile: Tile): PageBox {
  return { ...tile.clear, x: tile.clear.x - tile.box.x, y: tile.clear.y - tile.box.y };
}

/** Zooms and pans so every object on a tile's surface is in view in it. */
export function fitTile(table: TableState, types: Types, tile: Tile): void {
  const clear = clearInside(tile);
  const box = tableBounds(table, types, tile.surface);
  setViewport(tile.surface, box ? fitted(box, clear) : centred(clear));
}

function fitted([x0, y0, x1, y1]: Box, clear: PageBox): Viewport {
  const margin = Math.min(MARGIN, clear.width / 10, clear.height / 10);
  const availW = clear.width - 2 * margin;
  const availH = clear.height - 2 * margin;
  const scale = clamp(Math.min(availW / (x1 - x0), availH / (y1 - y0)), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: clear.x + margin + (availW - (x1 - x0) * scale) / 2 - x0 * scale,
    y: clear.y + margin + (availH - (y1 - y0) * scale) / 2 - y0 * scale,
  };
}

function centred(clear: PageBox): Viewport {
  return {
    scale: EMPTY_SCALE,
    x: clear.x + clear.width / 2,
    y: clear.y + clear.height / 2,
  };
}

function setViewport(surface: string, viewport: Viewport): void {
  useStore.setState((s) => ({ viewports: { ...s.viewports, [surface]: viewport } }));
}

/** Zooms a surface by `factor`, keeping the point under `screen` on its canvas fixed. */
export function zoomAt(surface: string, screen: { x: number; y: number }, factor: number): void {
  const viewport = viewportOf(useStore.getState(), surface);
  const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  const worldX = (screen.x - viewport.x) / viewport.scale;
  const worldY = (screen.y - viewport.y) / viewport.scale;
  setViewport(surface, { scale, x: screen.x - worldX * scale, y: screen.y - worldY * scale });
}

/** The table point, in millimetres, under a point on a canvas. */
export function toWorld(viewport: Viewport, screen: { x: number; y: number }): [number, number] {
  return [(screen.x - viewport.x) / viewport.scale, (screen.y - viewport.y) / viewport.scale];
}

/** Whether part of a box on a surface lies outside the clear part of its canvas. */
export function outOfView(box: Box, viewport: Viewport, clear: PageBox): boolean {
  const [x0, y0, x1, y1] = box;
  const { x, y, scale } = viewport;
  return (
    x + x0 * scale < clear.x ||
    y + y0 * scale < clear.y ||
    x + x1 * scale > clear.x + clear.width ||
    y + y1 * scale > clear.y + clear.height
  );
}

/** Zooms and pans every tile so all of its surface is in view. */
export function fitWindow(): void {
  const { table, view } = useStore.getState();
  if (table && view) for (const tile of tilesNow()) fitTile(table, view.types, tile);
}

/** Zooms out a tile when an agent puts something there where the people watching cannot see it. */
export function keepTableInView(): void {
  const s = useStore.getState();
  const { table, view } = s;
  if (!table || !view) return;
  for (const tile of tilesNow()) {
    const box = tableBounds(table, view.types, tile.surface);
    if (box && outOfView(box, viewportOf(s, tile.surface), clearInside(tile)))
      fitTile(table, view.types, tile);
  }
}

/** Zooms every tile by `factor` around its middle. */
export function zoomWindow(factor: number): void {
  for (const tile of tilesNow()) {
    const clear = clearInside(tile);
    zoomAt(tile.surface, { x: clear.x + clear.width / 2, y: clear.y + clear.height / 2 }, factor);
  }
}

/** The surface in the biggest tile, the Centre when shown, and the point in the middle of it. */
export function viewCentre(): { surface: string; at: [number, number] } {
  const tile = tilesNow()[0];
  const surface = tile?.surface ?? CENTRE;
  const clear = tile ? clearInside(tile) : { x: 0, y: 0, width: 0, height: 0 };
  const at = toWorld(viewportOf(useStore.getState(), surface), {
    x: clear.x + clear.width / 2,
    y: clear.y + clear.height / 2,
  });
  return { surface, at };
}

/** Where a point on a surface is on the page, or nothing when its tile is not shown. */
export function pageOf(
  surface: string,
  point: readonly [number, number],
): [number, number] | undefined {
  const tile = tilesNow().find((t) => t.surface === surface);
  if (!tile) return undefined;
  const { x, y, scale } = viewportOf(useStore.getState(), surface);
  return [tile.box.x + x + point[0] * scale, tile.box.y + y + point[1] * scale];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
