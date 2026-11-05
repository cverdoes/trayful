import { MOTION_MS } from './motions';

/** Most cards a riffle draws; a bigger pile riffles the same, just thicker. */
export const RIFFLE_CARDS = 12;
/** Share of the shuffle spent pulling the pile apart into two halves. */
const SPLIT = 0.3;
/** Share of the shuffle by which the last card has dropped back. */
const DROPPED = 0.85;
/** Share of the shuffle one card takes to drop back onto the pile. */
const DROP = 0.1;
/** How far the halves lean outwards, in degrees, as if bent between thumbs. */
const LEAN = 10;
/** How far apart each card in a half sits from the next, in mm, so the halves read as piles. */
const EDGE = 0.4;

/** Where one card of a riffle is, relative to the pile's centre. */
export interface CardPlacement {
  x: number;
  y: number;
  rot: number;
}

/**
 * The cards of a pile `width` mm wide, `elapsed` ms into a riffle shuffle, bottom first;
 * undefined once it is over. The pile splits into a left and a right half that lean
 * apart, then the cards drop back onto the middle from the bottom up, from each half in
 * turn, until the pile lies squared up as it was.
 */
export function riffleFrame(
  elapsed: number,
  cards: number,
  width: number,
): CardPlacement[] | undefined {
  const progress = Math.max(0, elapsed) / MOTION_MS.shuffle;
  if (progress >= 1) return undefined;
  const apart = easeOut(Math.min(1, progress / SPLIT));
  const span = Math.max(1, cards - 1);
  return Array.from({ length: cards }, (_, i) => {
    // Cards alternate between the halves, so dropping them in order interleaves them.
    const side = i % 2 === 0 ? -1 : 1;
    const dropsAt = SPLIT + (i / span) * (DROPPED - DROP - SPLIT);
    const out = apart * (1 - easeOut(clamp01((progress - dropsAt) / DROP)));
    const inHalf = Math.floor(i / 2);
    return {
      x: side * out * (width * 0.55 + inHalf * EDGE),
      y: -out * inHalf * EDGE,
      rot: side * out * LEAN,
    };
  });
}

/**
 * How far the cards of a fanned or spread-out pile have gathered into one spot, from
 * 0 (laid out) to 1 (together), `elapsed` ms into a shuffle; undefined once it is over.
 * They gather, stay together a moment, and spread out again.
 */
export function gatherFrame(elapsed: number): number | undefined {
  const progress = Math.max(0, elapsed) / MOTION_MS.shuffle;
  if (progress >= 1) return undefined;
  if (progress < 0.35) return easeOut(progress / 0.35);
  if (progress < 0.65) return 1;
  return 1 - easeOut((progress - 0.65) / 0.35);
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}
