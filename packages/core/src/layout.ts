import type { StackObject, Vec2 } from '@trayful/formats/browser';
import { sizeOf, type Catalog, type Piece, type TableObject, type TableState } from './state.js';

export type StackLayout = NonNullable<StackObject['layout']>;

/** Gap between cards in a spread, in millimetres. */
const SPREAD_GAP = 3;
/** How much of each card a fan leaves visible. */
const FAN_SHOW = 0.3;

/**
 * Where each piece of a stack lies relative to the stack's centre, before the
 * stack's rotation, bottom piece first. A pile puts them all in one place; a
 * fan overlaps them in a row and a spread lays them side by side.
 */
export function stackOffsets(layout: StackLayout | undefined, count: number, size: Vec2): Vec2[] {
  const step =
    layout === 'spread'
      ? size[0] + SPREAD_GAP
      : layout === 'fan'
        ? Math.max(size[0] * FAN_SHOW, 4)
        : 0;
  return Array.from({ length: count }, (_, i): Vec2 => [step && (i - (count - 1) / 2) * step, 0]);
}

/** Width and height of a stack's footprint, before rotation. */
export function stackSize(layout: StackLayout | undefined, count: number, size: Vec2): Vec2 {
  const offsets = stackOffsets(layout, count, size);
  const spanX = count > 1 ? offsets.at(-1)![0] - offsets[0]![0] : 0;
  return [size[0] + spanX, size[1]];
}

/** Width and height of an object on the table, before rotation, including a stack's fan or spread. */
export function objectSize(state: TableState, catalog: Catalog, object: TableObject): Vec2 {
  const top =
    object.kind === 'stack' ? (state.objects[object.items.at(-1)!] as Piece | undefined) : object;
  const type = top && catalog[top.type];
  const size = type ? sizeOf(type) : ([20, 20] as Vec2);
  return object.kind === 'stack' ? stackSize(object.layout, object.items.length, size) : size;
}
