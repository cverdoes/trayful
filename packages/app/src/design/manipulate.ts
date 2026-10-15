// Moving, resizing and rotating a layer on the designer canvas, and snapping it
// to the grid, the face's edges and centre, and the other layers. Everything is in
// millimetres on the face; the canvas turns pointer pixels into these first.
import type { Layer } from '@trayful/formats/browser';
import { textBox } from '../render/face';
import { setIn } from './edit';
import { layerBounds, type Box } from './layout';

/** Grid spacing on the faces, in millimetres. */
export const GRID = 5;

export type Point = [number, number];

/** A corner of a layer's box, or its right edge for a text's wrap width. */
export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'e';

/** A line something snapped to, drawn while dragging so people see why it stopped there. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

/** Lines worth snapping to on each axis: the face's edges and centre, and every other layer's. */
export interface SnapLines {
  x: number[];
  y: number[];
}

export function snapLines(face: Point, others: Layer[]): SnapLines {
  const [w, h] = face;
  const lines: SnapLines = { x: [0, w / 2, w], y: [0, h / 2, h] };
  for (const layer of others) {
    const b = layerBounds(layer, face);
    lines.x.push(b.x, b.x + b.w / 2, b.x + b.w);
    lines.y.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return lines;
}

/**
 * How far to shift something on one axis so that one of its `edges` lands on a
 * line, or failing that on the grid, when either is within `tolerance`.
 */
function snapAxis(
  edges: number[],
  lines: number[],
  tolerance: number,
): { shift: number; line?: number } {
  let best: { shift: number; line?: number } | undefined;
  for (const edge of edges) {
    for (const line of lines) {
      const shift = line - edge;
      if (Math.abs(shift) <= tolerance && (!best || Math.abs(shift) < Math.abs(best.shift))) {
        best = { shift, line };
      }
    }
  }
  if (best) return best;
  const start = edges[0]!;
  const shift = Math.round(start / GRID) * GRID - start;
  return Math.abs(shift) <= tolerance ? { shift } : { shift: 0 };
}

/** The shift that snaps a moved box by its start, centre or end, and the lines it met. */
export function snapBox(
  box: Box,
  lines: SnapLines,
  tolerance: number,
): { shift: Point; guides: Guide[] } {
  const x = snapAxis([box.x, box.x + box.w / 2, box.x + box.w], lines.x, tolerance);
  const y = snapAxis([box.y, box.y + box.h / 2, box.y + box.h], lines.y, tolerance);
  return { shift: [x.shift, y.shift], guides: guidesOf(x.line, y.line) };
}

/** A point snapped the same way: a corner being resized, or a snap spot being placed. */
export function snapPoint(
  point: Point,
  lines: SnapLines,
  tolerance: number,
): { point: Point; guides: Guide[] } {
  const x = snapAxis([point[0]], lines.x, tolerance);
  const y = snapAxis([point[1]], lines.y, tolerance);
  return {
    point: [round(point[0] + x.shift), round(point[1] + y.shift)],
    guides: guidesOf(x.line, y.line),
  };
}

function guidesOf(x: number | undefined, y: number | undefined): Guide[] {
  const guides: Guide[] = [];
  if (x !== undefined) guides.push({ axis: 'x', at: x });
  if (y !== undefined) guides.push({ axis: 'y', at: y });
  return guides;
}

/** Millimetres kept to a tenth, so files read `12.5`, not `12.4999…`. */
export const round = (mm: number) => Math.round(mm * 10) / 10;

export function movedLayer(layer: Layer, [dx, dy]: Point): Layer {
  const [x, y] = layer.at ?? [0, 0];
  return { ...layer, at: [round(x + dx), round(y + dy)] };
}

/**
 * The layer with one handle of its box dragged to `point`, the opposite corner
 * staying put. A circle drawn from its centre changes its radius instead, and a
 * text changes how wide it wraps.
 */
export function resizedLayer(layer: Layer, handle: Handle, point: Point, face: Point): Layer {
  const box = layerBounds(layer, face);
  if ('text' in layer) {
    return {
      ...layer,
      at: [round(box.x), layer.at?.[1] ?? 0],
      width: round(Math.max(5, point[0] - box.x)),
    };
  }
  if (!('image' in layer) && layer.r !== undefined) {
    const [cx, cy] = layer.at ?? [0, 0];
    return { ...layer, r: round(Math.max(0.5, Math.hypot(point[0] - cx, point[1] - cy))) };
  }
  const [fx, fy] = opposite(box, handle);
  const x = Math.min(fx, point[0]);
  const y = Math.min(fy, point[1]);
  const size: Point = [
    round(Math.max(1, Math.abs(point[0] - fx))),
    round(Math.max(1, Math.abs(point[1] - fy))),
  ];
  return { ...layer, at: [round(x), round(y)], size };
}

/** The corner that stays put while `handle` is dragged. */
function opposite(box: Box, handle: Handle): Point {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  return {
    nw: [right, bottom],
    ne: [box.x, bottom],
    sw: [right, box.y],
    se: [box.x, box.y],
    e: [box.x, box.y],
  }[handle] as Point;
}

/** Where each handle of a box sits; texts only have a wrap-width handle. */
export function handlesOf(layer: Layer, box: Box): [Handle, Point][] {
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  if ('text' in layer) return [['e', [right, box.y + box.h / 2]]];
  return [
    ['nw', [box.x, box.y]],
    ['ne', [right, box.y]],
    ['sw', [box.x, bottom]],
    ['se', [right, bottom]],
  ];
}

/**
 * The point a layer turns around, as the renderer draws it: a text's box corner,
 * an ellipse's or polygon's centre, and the anchor `at` for everything else.
 */
export function pivotOf(layer: Layer, face: Point): Point {
  if ('text' in layer) {
    const box = textBox(layer);
    return [box.x, box.y];
  }
  const [x, y] = layer.at ?? [0, 0];
  if ('image' in layer || layer.r !== undefined) return [x, y];
  const centred = ['circle', 'disc', 'ellipse', 'hex', 'triangle'].includes(layer.shape);
  if (!centred) return [x, y];
  const b = layerBounds(layer, face);
  return [b.x + b.w / 2, b.y + b.h / 2];
}

/** Snap rotation to multiples of this many degrees when close to one. */
const ROTATE_STEP = 15;

/**
 * The layer turned by as much as the pointer has turned around its pivot since
 * `from`, where the drag started. Close to a multiple of 15° it snaps to it; 0°
 * removes the key.
 */
export function rotatedLayer(layer: Layer, from: Point, to: Point, face: Point): Layer {
  const pivot = pivotOf(layer, face);
  const raw = (layer.rotate ?? 0) + angle(pivot, to) - angle(pivot, from);
  const nearest = Math.round(raw / ROTATE_STEP) * ROTATE_STEP;
  const degrees = normalize(Math.abs(raw - nearest) <= 4 ? nearest : Math.round(raw));
  return setIn(layer, ['rotate'], degrees === 0 ? undefined : degrees);
}

const angle = ([px, py]: Point, [x, y]: Point) => (Math.atan2(y - py, x - px) * 180) / Math.PI;

/** Degrees in (-180, 180]. */
function normalize(degrees: number): number {
  const d = ((degrees % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/**
 * A resized layer moved so that the corner that stayed put in its own frame also
 * stays put on the face, which it would not when the layer is turned: resizing
 * moves the point it turns around.
 */
export function keepFixedCorner(before: Layer, after: Layer, handle: Handle, face: Point): Layer {
  const degrees = before.rotate ?? 0;
  if (!degrees) return after;
  const corner = opposite(layerBounds(before, face), handle);
  const was = unrotate(corner, pivotOf(before, face), -degrees);
  const is = unrotate(corner, pivotOf(after, face), -degrees);
  return movedLayer(after, [was[0] - is[0], was[1] - is[1]]);
}

/** A face point turned back around `pivot` by `degrees`, into the layer's unrotated frame. */
export function unrotate(point: Point, pivot: Point, degrees: number): Point {
  const a = (-degrees * Math.PI) / 180;
  const [dx, dy] = [point[0] - pivot[0], point[1] - pivot[1]];
  return [
    pivot[0] + dx * Math.cos(a) - dy * Math.sin(a),
    pivot[1] + dx * Math.sin(a) + dy * Math.cos(a),
  ];
}
