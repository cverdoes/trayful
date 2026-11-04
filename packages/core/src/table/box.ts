// Taking components out of the box: new pieces and decks, laid out in rows.
import { sidesOf, startValue, type ComponentType, type Vec2 } from '@trayful/formats/browser';
import type { ComponentSpec } from '@trayful/formats';
import type { Piece, Stack } from './state.js';

/** How wide the rows of components fresh out of the box may get, in millimetres. */
export const BOX_WIDTH = 1200;
/** Space between a layout and the components put below it. */
export const MARGIN = 40;
/** Space between neighbours in a row. */
const GAP = 10;

/** An object to lay out, with its width and height. */
export interface Sized {
  id: string;
  size: Vec2;
}

export function newPiece(
  { id, data }: ComponentSpec,
  type: ComponentType,
  face: 'up' | 'down',
  parent?: string,
): Piece {
  const piece: Piece = { kind: 'piece', id, type: type.id, data, pos: [0, 0], rot: 0, face, z: 0 };
  if (Object.keys(data).length === 0) delete piece.data;
  if (parent) piece.parent = parent;
  const value = startValue(type);
  if (value !== undefined) piece.value = value;
  if (sidesOf(type) === 1) piece.face = 'up';
  return piece;
}

/** The stack id a deck gets on the table. */
export function deckStackId(deck: string): string {
  return `deck:${deck}`;
}

/** A deck's stack at the origin, holding `items` from the bottom up. */
export function newDeck(deck: string, items: string[], z: number): Stack {
  return { kind: 'stack', id: deckStackId(deck), name: deck, pos: [0, 0], rot: 0, z, items };
}

/** Lays objects out left to right in rows no wider than `width`, from `origin` (a top-left corner). */
export function rows(items: Sized[], origin: Vec2, width: number): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  let cursor: Vec2 = [0, 0];
  let rowHeight = 0;
  for (const { id, size } of items) {
    if (cursor[0] > 0 && cursor[0] + size[0] > width) {
      cursor = [0, cursor[1] + rowHeight + GAP];
      rowHeight = 0;
    }
    out.set(id, [origin[0] + cursor[0] + size[0] / 2, origin[1] + cursor[1] + size[1] / 2]);
    cursor = [cursor[0] + size[0] + GAP, cursor[1]];
    rowHeight = Math.max(rowHeight, size[1]);
  }
  return out;
}
