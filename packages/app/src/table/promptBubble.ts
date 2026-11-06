import { allSpots, onTable, type PlayerPrompt, type TableState } from '@trayful/core';
import type { CSSProperties } from 'react';
import type { Types } from '../render/geometry';
import type { Viewport } from '../store';

/** How far a bubble keeps from the window's edges, in pixels. */
const EDGE = 16;
/** Half the width of a bubble, which is centred over what it points at. */
const HALF_BUBBLE = 180;
/** Room a bubble needs above what it points at; with less, it goes below instead. */
const ROOM_ABOVE = 240;

/** What of the page's store a bubble needs to find its place. */
interface InView {
  table?: TableState;
  view?: { types: Types };
  viewport: Viewport;
}

/**
 * Where on screen the piece or place a prompt points at is, or nothing when it is not
 * on the table in view, such as a card in the hand. Kept as a string so the store
 * selector only changes when the position does.
 */
export function anchorOnScreen(prompt: PlayerPrompt, s: InView): string | undefined {
  const { anchor } = prompt;
  if (!anchor || !s.table || !s.view) return undefined;
  const object = s.table.objects[anchor];
  const pos =
    object && onTable(object)
      ? object.pos
      : allSpots(s.table, s.view.types).find(
          (spot) => spot.ref === anchor || `${spot.owner}/${spot.target}` === anchor,
        )?.pos;
  if (!pos) return undefined;
  const { x, y, scale } = s.viewport;
  return `${Math.round(x + pos[0] * scale)},${Math.round(y + pos[1] * scale)}`;
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
