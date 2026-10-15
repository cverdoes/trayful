import type { TableState } from '@trayful/core';
import { bounds, topLevel, type Types } from './render/geometry';
import { useStore, type Viewport } from './store';

const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
export const TOOLBAR_HEIGHT = 56;
/** The hand tray along the bottom of the screen. */
export const HAND_HEIGHT = 120;
const MARGIN = 32;

type Box = [number, number, number, number];

/** The rectangle `[x0, y0, x1, y1]` in mm that holds every object, or nothing for an empty table. */
export function tableBounds(table: TableState, types: Types): Box | undefined {
  const objects = topLevel(table);
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

/** Zooms and pans so every object on the table is in view. */
export function fitToTable(table: TableState, types: Types, width: number, height: number): void {
  const box = tableBounds(table, types);
  if (!box) return;
  const [x0, y0, x1, y1] = box;
  const availW = width - 2 * MARGIN;
  const availH = height - TOOLBAR_HEIGHT - HAND_HEIGHT - 2 * MARGIN;
  const scale = clamp(Math.min(availW / (x1 - x0), availH / (y1 - y0)), MIN_SCALE, MAX_SCALE);
  useStore.setState({
    viewport: {
      scale,
      x: MARGIN + (availW - (x1 - x0) * scale) / 2 - x0 * scale,
      y: TOOLBAR_HEIGHT + MARGIN + (availH - (y1 - y0) * scale) / 2 - y0 * scale,
    },
  });
}

/** Zooms by `factor` keeping the table point under `screen` fixed. */
export function zoomAt(screen: { x: number; y: number }, factor: number): void {
  const { viewport } = useStore.getState();
  const scale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
  const worldX = (screen.x - viewport.x) / viewport.scale;
  const worldY = (screen.y - viewport.y) / viewport.scale;
  useStore.setState({
    viewport: { scale, x: screen.x - worldX * scale, y: screen.y - worldY * scale },
  });
}

/** The table point, in millimetres, under a point on the screen. */
export function toWorld(viewport: Viewport, screen: { x: number; y: number }): [number, number] {
  return [(screen.x - viewport.x) / viewport.scale, (screen.y - viewport.y) / viewport.scale];
}

/** Whether part of a box on the table lies outside the screen, or under the toolbar or the hand tray. */
export function outOfView(box: Box, viewport: Viewport, width: number, height: number): boolean {
  const [x0, y0, x1, y1] = box;
  const { x, y, scale } = viewport;
  return (
    x + x0 * scale < 0 ||
    y + y0 * scale < TOOLBAR_HEIGHT ||
    x + x1 * scale > width ||
    y + y1 * scale > height - HAND_HEIGHT
  );
}

/** Zooms and pans so the whole table fits the window. */
export function fitWindow(): void {
  const { table, view } = useStore.getState();
  if (table && view) fitToTable(table, view.types, window.innerWidth, window.innerHeight);
}

/** Zooms out when an agent puts something where the people watching cannot see it. */
export function keepTableInView(): void {
  const { table, view, viewport } = useStore.getState();
  const box = table && view && tableBounds(table, view.types);
  if (box && outOfView(box, viewport, window.innerWidth, window.innerHeight)) fitWindow();
}

/** Zooms by `factor` around the middle of the window. */
export function zoomWindow(factor: number): void {
  zoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, factor);
}

/** The table point in the middle of the window. */
export function windowCentre(): [number, number] {
  const { viewport } = useStore.getState();
  return toWorld(viewport, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
