// Bags on the table: what they hold, as far as anyone may know, and drawing out of them.
import { allSpots, type Command, type SnapSpot, type TableState } from '@trayful/core';
import type { Types } from './render/geometry';

/** A bag on the table and how many pieces it holds. */
export interface Bag {
  spot: SnapSpot;
  count: number;
}

/** Every bag on the table. Its pieces are never sent to anyone; only how many there are. */
export function bagsOn(table: TableState & { bags?: Record<string, number> }, types: Types): Bag[] {
  return allSpots(table, types)
    .filter((spot) => spot.mode === 'bag')
    .map((spot) => ({ spot, count: table.bags?.[spot.ref] ?? 0 }));
}

/**
 * Draws one piece at random out of a bag: into the player's hand, or for someone
 * who has not joined, onto the table beside the bag.
 */
export function drawFromBag(bag: Bag, player: string | undefined): Command | undefined {
  if (bag.count === 0) return undefined;
  const [w] = bag.spot.area!;
  const beside: [number, number] = [bag.spot.pos[0] + w / 2 + 15, bag.spot.pos[1]];
  return { type: 'draw', from: bag.spot.ref, to: player ? `hand:${player}` : beside };
}

/** Drawing from the bag on the one selected piece, when that bag holds anything. */
export function selectedBagDraw(
  table: TableState & { bags?: Record<string, number> },
  types: Types,
  selection: string[],
  player: string | undefined,
): Command | undefined {
  if (selection.length !== 1) return undefined;
  const bag = bagsOn(table, types).find((b) => b.spot.owner === selection[0] && b.count > 0);
  return bag && drawFromBag(bag, player);
}
