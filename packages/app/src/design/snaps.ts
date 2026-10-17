// A container's drop areas in the designer: where their spots are, and the edits dragging
// their handles makes. Positions are millimetres from the face's top-left corner,
// as the library file has them.
import type { ComponentType, SnapTarget } from '@trayful/formats/browser';
import { round, type Point } from './manipulate';

export type TargetKind = 'grid' | 'points' | 'area';

/** The drop areas the designer adds: each shape, and the shapes with a mode set. */
export type NewTargetKind = TargetKind | 'pile' | 'group' | 'row' | 'bag';

export function targetKind(target: SnapTarget): TargetKind {
  if (target.grid) return 'grid';
  return target.points ? 'points' : 'area';
}

const pair = (size: number | [number, number]): Point =>
  typeof size === 'number' ? [size, size] : size;

/** Every spot of a target, numbered as setups and agents name them, from 0. */
export function spotsOf(target: SnapTarget): Point[] {
  if (target.points) return target.points;
  if (!target.grid) return [];
  const { origin, cols, rows, cell } = target.grid;
  const [cw, ch] = pair(cell);
  const spots: Point[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) spots.push([origin[0] + col * cw, origin[1] + row * ch]);
  }
  return spots;
}

/** A free area's box, as `[x, y, w, h]`. */
export function areaBox(target: SnapTarget): [number, number, number, number] | undefined {
  if (!target.area) return undefined;
  const [w, h] = pair(target.area.size);
  return [target.area.at[0], target.area.at[1], w, h];
}

/** A new target of a kind near the middle of the face, under an id no other target has. */
export function newTarget(kind: NewTargetKind, type: ComponentType, face: Point): SnapTarget {
  const taken = new Set((type.container ?? []).map((t) => t.id));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n++;
  const id = `${kind}-${n}`;
  const [cx, cy] = [round(face[0] / 2), round(face[1] / 2)];
  if (kind === 'grid')
    return { id, grid: { origin: [cx - 10, cy - 10], cols: 2, rows: 2, cell: 20 } };
  if (kind === 'points') return { id, points: [[cx, cy]] };
  if (kind === 'pile' || kind === 'group') return { id, points: [[cx, cy]], mode: kind };
  if (kind === 'row') return { id, area: { at: [cx - 40, cy - 15], size: [80, 30] }, mode: 'row' };
  if (kind === 'bag') return { id, area: { at: [cx - 15, cy - 15], size: 30 }, mode: 'bag' };
  return { id, area: { at: [cx - 20, cy - 20], size: 40 } };
}

/** The handles of a target, each a point to drag and what dragging it changes. */
export type TargetHandle =
  | { kind: 'origin' }
  | { kind: 'cell' }
  | { kind: 'extent' }
  | { kind: 'point'; index: number }
  | { kind: 'area' }
  | { kind: 'area-size' };

/**
 * Handles never sit on top of each other: spot 0 moves a grid, a handle halfway
 * to the next spot diagonally sets the spacing, and one beyond the last spot, down
 * and to the right, the number of columns and rows.
 */
export function targetHandles(target: SnapTarget): [TargetHandle, Point][] {
  if (target.grid) {
    const { origin, cell } = target.grid;
    const [cw, ch] = pair(cell);
    const [lx, ly] = spotsOf(target).at(-1)!;
    return [
      [{ kind: 'origin' }, origin],
      [{ kind: 'cell' }, [origin[0] + cw / 2, origin[1] + ch / 2]],
      // Three quarters of a cell out, so even a one-spot grid's handles stay apart.
      [{ kind: 'extent' }, [lx + 0.75 * cw, ly + 0.75 * ch]],
    ];
  }
  if (target.points) {
    return target.points.map((p, index): [TargetHandle, Point] => [{ kind: 'point', index }, p]);
  }
  const [x, y, w, h] = areaBox(target)!;
  return [
    [{ kind: 'area-size' }, [x + w, y + h]],
    [{ kind: 'area' }, [x, y]],
  ];
}

/**
 * The target with a handle dragged to `point` (see `targetHandles` for a grid's);
 * a point moves; an area moves by its corner or changes size by the opposite one.
 */
export function draggedTarget(target: SnapTarget, handle: TargetHandle, point: Point): SnapTarget {
  const [px, py] = point;
  if (target.grid) {
    const grid = target.grid;
    const [ox, oy] = grid.origin;
    const [cw, ch] = pair(grid.cell);
    if (handle.kind === 'origin') return { ...target, grid: { ...grid, origin: point } };
    if (handle.kind === 'cell') {
      const cell: Point = [round(Math.max(1, 2 * (px - ox))), round(Math.max(1, 2 * (py - oy)))];
      return { ...target, grid: { ...grid, cell: cell[0] === cell[1] ? cell[0] : cell } };
    }
    const cols = Math.max(1, Math.round((px - ox) / cw + 0.25));
    const rows = Math.max(1, Math.round((py - oy) / ch + 0.25));
    return { ...target, grid: { ...grid, cols, rows } };
  }
  if (target.points && handle.kind === 'point') {
    const points = target.points.map((p, i) => (i === handle.index ? point : p));
    return { ...target, points };
  }
  return draggedArea(target, handle, point);
}

function draggedArea(target: SnapTarget, handle: TargetHandle, point: Point): SnapTarget {
  const box = areaBox(target);
  if (!box) return target;
  const [x, y] = box;
  if (handle.kind === 'area') return { ...target, area: { ...target.area!, at: point } };
  const w = round(Math.max(1, point[0] - x));
  const h = round(Math.max(1, point[1] - y));
  return { ...target, area: { at: [x, y], size: w === h ? w : [w, h] } };
}

/** The target with one more spot at `point`, for a list of points such as a track. */
export function withPoint(target: SnapTarget, point: Point): SnapTarget {
  return { ...target, points: [...(target.points ?? []), point] };
}
