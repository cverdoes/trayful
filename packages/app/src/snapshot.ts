import { CENTRE } from '@trayful/core';
import type Konva from 'konva';
import { useStore } from './store';
import { tableBounds, viewportOf } from './table/viewport';

/** Longest side of a snapshot in pixels: enough to read card titles. */
const SNAPSHOT_SIZE = 1600;
const PADDING_MM = 10;
const FELT = '#2f5d50';

/** The canvas of each surface's tile on screen, by surface id. */
const stages = new Map<string, Konva.Stage>();

/** Called by each tile so snapshots can draw its surface. */
export function setSnapshotStage(surface: string, next: Konva.Stage | null): void {
  if (next) stages.set(surface, next);
  else stages.delete(surface);
}

/**
 * Draws the whole of a surface, whatever part is on screen, and returns it as
 * base64 PNG data: the Centre, or the first surface shown when the Centre is not.
 */
export function snapshotTable(): string {
  const state = useStore.getState();
  const { table, view } = state;
  const [surface, stage] = stages.has(CENTRE)
    ? [CENTRE, stages.get(CENTRE)]
    : (stages.entries().next().value ?? [CENTRE, undefined]);
  if (!stage || !table || !view) throw new Error('The table is not on screen yet.');
  const v = viewportOf(state, surface);
  const box = tableBounds(table, view.types, surface) ?? [0, 0, 100, 100];
  const [x0, y0, x1, y1] = [
    box[0] - PADDING_MM,
    box[1] - PADDING_MM,
    box[2] + PADDING_MM,
    box[3] + PADDING_MM,
  ];
  const rect = {
    x: v.x + x0 * v.scale,
    y: v.y + y0 * v.scale,
    width: (x1 - x0) * v.scale,
    height: (y1 - y0) * v.scale,
  };
  const pixelRatio = SNAPSHOT_SIZE / Math.max(rect.width, rect.height);
  const pieces = stage.toCanvas({ ...rect, pixelRatio });
  const out = document.createElement('canvas');
  out.width = pieces.width;
  out.height = pieces.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(pieces, 0, 0);
  return out.toDataURL('image/png').slice('data:image/png;base64,'.length);
}
