import type { TableState } from '@trayful/core';
import { bounds, topLevel, type Types } from './render/geometry';
import { useStore } from './store';

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 12;
export const TOOLBAR_HEIGHT = 56;
/** The hand tray along the bottom of the screen. */
export const HAND_HEIGHT = 120;
const MARGIN = 32;

/** The rectangle `[x0, y0, x1, y1]` in mm that holds every object, or nothing for an empty table. */
export function tableBounds(
  table: TableState,
  types: Types,
): [number, number, number, number] | undefined {
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

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
