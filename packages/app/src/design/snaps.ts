// Snap targets in the designer: where their spots are, and the edits dragging
// their handles makes. Positions are millimetres from the face's top-left corner,
// as the library file has them.
import type { ComponentType, SnapTarget } from '@trayful/formats/browser';
import { round, type Point } from './manipulate';

export type TargetKind = 'grid' | 'points' | 'area';

/** Primitives whose components other pieces can snap onto. */
export const SNAPPING_BASES = new Set(['board', 'tile', 'zone']);

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
export function newTarget(kind: TargetKind, type: ComponentType, face: Point): SnapTarget {
  const taken = new Set((type.snap ?? []).map((t) => t.id));
  let n = 1;
  while (taken.has(`${kind}-${n}`)) n++;
  const id = `${kind}-${n}`;
  const [cx, cy] = [round(face[0] / 2), round(face[1] / 2)];
  if (kind === 'grid')
    // Three columns, so the spacing and size handles (spot 4 and the last spot) are apart.
    return { id, grid: { origin: [cx - 20, cy - 10], cols: 3, rows: 2, cell: 20 } };
  if (kind === 'points') return { id, points: [[cx, cy]] };
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

export function targetHandles(target: SnapTarget): [TargetHandle, Point][] {
  if (target.grid) {
    const spots = spotsOf(target);
    const { origin, cell } = target.grid;
    const [cw, ch] = pair(cell);
    return [
      [{ kind: 'extent' }, spots.at(-1)!],
      [{ kind: 'cell' }, [origin[0] + cw, origin[1] + ch]],
      [{ kind: 'origin' }, origin],
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
 * The target with a handle dragged to `point`: the grid's first spot moves the
 * whole grid, its diagonal neighbour sets the spacing, and its last spot sets how
 * many columns and rows it has; a point moves; an area moves by its corner or
 * changes size by the opposite one.
 */
export function draggedTarget(target: SnapTarget, handle: TargetHandle, point: Point): SnapTarget {
  const [px, py] = point;
  if (target.grid) {
    const grid = target.grid;
    const [ox, oy] = grid.origin;
    const [cw, ch] = pair(grid.cell);
    if (handle.kind === 'origin') return { ...target, grid: { ...grid, origin: point } };
    if (handle.kind === 'cell') {
      const cell: Point = [round(Math.max(1, px - ox)), round(Math.max(1, py - oy))];
      return { ...target, grid: { ...grid, cell: cell[0] === cell[1] ? cell[0] : cell } };
    }
    const cols = Math.max(1, Math.round((px - ox) / cw) + 1);
    const rows = Math.max(1, Math.round((py - oy) / ch) + 1);
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
