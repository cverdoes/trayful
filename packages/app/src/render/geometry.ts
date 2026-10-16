import {
  objectSize as coreObjectSize,
  onTable,
  type Piece,
  type TableObject,
  type TableState,
} from '@trayful/core';
import { isStackable, stacksWith, type ComponentType } from '@trayful/formats/browser';

export type Types = Record<string, ComponentType>;

export function sizeOf(type: Pick<ComponentType, 'size'>): [number, number] {
  return typeof type.size === 'number' ? [type.size, type.size] : type.size;
}

/** The piece that represents an object: itself, or the top piece of a stack. */
export function facePiece(table: TableState, object: TableObject): Piece | undefined {
  if (object.kind === 'piece') return object;
  const top = table.objects[object.items.at(-1)!];
  return top?.kind === 'piece' ? top : undefined;
}

/** Width and height of an object, including a fanned or spread-out stack, before rotation. */
export function objectSize(table: TableState, types: Types, object: TableObject): [number, number] {
  return coreObjectSize(table, types, object);
}

/** Size of one piece of the object: itself, or the top piece of a stack. */
export function pieceSize(table: TableState, types: Types, object: TableObject): [number, number] {
  const piece = facePiece(table, object);
  const type = piece && types[piece.type];
  return type ? sizeOf(type) : [20, 20];
}

/** Axis-aligned bounds of an object, ignoring rotation. */
export function bounds(table: TableState, types: Types, object: TableObject) {
  const [w, h] = objectSize(table, types, object);
  return { x: object.pos[0] - w / 2, y: object.pos[1] - h / 2, w, h };
}

/** Objects lying directly on the table, bottom to top. */
export function topLevel(table: TableState): TableObject[] {
  return Object.values(table.objects)
    .filter(onTable)
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

/** The library component of an object: its own, or that of the top piece of a stack. */
export function typeOf(
  table: TableState,
  types: Types,
  object: TableObject,
): ComponentType | undefined {
  const piece = facePiece(table, object);
  return piece ? types[piece.type] : undefined;
}

/**
 * The object a dragged selection would stack onto when dropped at `point`:
 * the topmost unlocked object under the point that it may share a stack with.
 */
export function dropTarget(
  table: TableState,
  types: Types,
  dragged: string[],
  point: [number, number],
): TableObject | undefined {
  const first = table.objects[dragged[0]!];
  const type = first && typeOf(table, types, first);
  if (!type || !isStackable(type)) return undefined;
  const candidates = topLevel(table).filter((o) => {
    const other = typeOf(table, types, o);
    return !dragged.includes(o.id) && !o.locked && other !== undefined && stacksWith(type, other);
  });
  for (const o of candidates.toReversed()) {
    const b = bounds(table, types, o);
    if (point[0] >= b.x && point[0] <= b.x + b.w && point[1] >= b.y && point[1] <= b.y + b.h)
      return o;
  }
  return undefined;
}
