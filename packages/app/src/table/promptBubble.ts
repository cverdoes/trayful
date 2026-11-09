import { allSpots, onTable, surfaceOf, type PlayerPrompt, type TableState } from '@trayful/core';
import type { CSSProperties } from 'react';
import type { Types } from '../render/geometry';

/** How far a bubble keeps from the window's edges, in pixels. */
const EDGE = 16;
/** Half the width of a bubble, which is centred over what it points at. */
const HALF_BUBBLE = 180;
/** Room a bubble needs above what it points at; with less, it goes below instead. */
const ROOM_ABOVE = 240;

/** What of the page a bubble needs to find its place. */
interface InView {
  table?: TableState;
  view?: { types: Types };
  /** Where a point on a surface is on the page, or nothing when its tile is not shown. */
  pageOf: (surface: string, point: readonly [number, number]) => [number, number] | undefined;
}

/**
 * Where on screen the piece or place a prompt points at is, or nothing when it is not
 * on a surface in view, such as a card in the hand or on a hidden surface. Kept as a string so the store
 * selector only changes when the position does.
 */
export function anchorOnScreen(prompt: PlayerPrompt, s: InView): string | undefined {
  const { anchor } = prompt;
  if (!anchor || !s.table || !s.view) return undefined;
  const { table } = s;
  const object = table.objects[anchor];
  const spot = allSpots(table, s.view.types).find(
    (place) => place.ref === anchor || `${place.owner}/${place.target}` === anchor,
  );
  const at =
    object && onTable(object)
      ? s.pageOf(surfaceOf(object), object.pos)
      : spot && s.pageOf(surfaceOf(table.objects[spot.owner]!), spot.pos);
  return at && `${Math.round(at[0])},${Math.round(at[1])}`;
}

/** A bubble just above a point (or below it, near the top), kept inside a window that wide. */
export function bubbleAt(at: string, width: number): CSSProperties {
  const [x, y] = at.split(',').map(Number) as [number, number];
  const left = Math.min(Math.max(x, HALF_BUBBLE + EDGE), width - HALF_BUBBLE - EDGE);
  const above = y > ROOM_ABOVE;
  return {
    left,
    top: above ? y : Math.max(y, EDGE),
    transform: above ? 'translate(-50%, calc(-100% - 24px))' : 'translate(-50%, 24px)',
  };
}
