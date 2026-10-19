// What drop areas do with what landed in them, once a command has put things
// down: piles gather into one stack, groups spread out around their spot, rows
// close up left to right, and bags take their contents out of sight.
import type { Vec2 } from '@trayful/formats/browser';
import { objectSize } from './layout.js';
import { stack } from './pile-commands.js';
import { roundPos } from './room.js';
import { allSpots, occupants, ROW_GAP, toLocal, toTable, type SnapSpot } from './snap.js';
import type { Transaction } from './transaction.js';

/**
 * Settles the piles, rows and bags a command put things into or took things out
 * of. The others are left as they are, so an old table never stops a command.
 */
export function settle(tx: Transaction): void {
  const touched = touchedSpots(tx);
  for (const spot of allSpots(tx.current(), tx.catalog)) {
    if (!touched.has(spot.ref)) continue;
    if (spot.mode === 'pile') gather(tx, spot);
    else if (spot.mode === 'group') spread(tx, spot);
    else if (spot.mode === 'row') lineUp(tx, spot);
    else if (spot.mode === 'bag') bagUp(tx, spot);
  }
}

/** The spots that changed objects lie in now or lay in before the command. */
function touchedSpots(tx: Transaction): Set<string> {
  const refs = new Set<string>();
  for (const { before, after } of tx.changes()) {
    if (before?.snap) refs.add(before.snap);
    if (after?.snap) refs.add(after.snap);
  }
  return refs;
}

/** Everything lying on a pile spot becomes one stack, the lowest at the bottom. */
function gather(tx: Transaction, spot: SnapSpot): void {
  const [bottom, ...rest] = occupants(tx.current(), spot.ref).sort((a, b) => a.z - b.z);
  if (!bottom || rest.length === 0) return;
  stack(
    tx,
    rest.map((o) => o.id),
    bottom.id,
  );
}

/** How far apart the things in a group lie, as a share of the largest one's size. */
const GROUP_SPACING = 0.55;

/**
 * Spreads what lies on a group spot around it, in rows of a small square grid
 * centred on the spot, close enough to overlap a little so the group stays near
 * its spot. Things keep their places in the order of their ids, so the group
 * does not reshuffle when one of them is brought to the top.
 */
function spread(tx: Transaction, spot: SnapSpot): void {
  const state = tx.current();
  const items = occupants(state, spot.ref).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (items.length === 0) return;
  const step =
    GROUP_SPACING * Math.max(...items.map((o) => Math.max(...objectSize(state, tx.catalog, o))));
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = Math.ceil(items.length / cols);
  items.forEach((object, i) => {
    const [col, row] = [i % cols, Math.floor(i / cols)];
    const offset: Vec2 = [(col - (cols - 1) / 2) * step, (row - (rows - 1) / 2) * step];
    const pos = roundPos(toTable(spot, [0, 0], offset));
    if (pos[0] !== object.pos[0] || pos[1] !== object.pos[1] || object.rot !== spot.rot)
      tx.shift(object, pos, spot.rot);
  });
}

/**
 * Lines up what lies in a row from its left end, in the order it lies from left
 * to right, each turned like the row and centred across it, a small gap apart.
 * A row has no end: when it all does not fit, it runs on past the right end of
 * its area (which grows to match), so everything in it stays in full view.
 */
function lineUp(tx: Transaction, row: SnapSpot): void {
  const state = tx.current();
  const local = (pos: Vec2) => toLocal(row, [0, 0], pos)[0];
  const items = occupants(state, row.ref)
    .sort((a, b) => local(a.pos) - local(b.pos) || a.z - b.z)
    .map((object) => ({ object, width: objectSize(state, tx.catalog, object)[0] }));
  if (items.length === 0) return;
  let left = -row.area![0] / 2;
  for (const { object, width } of items) {
    const pos = roundPos(toTable(row, [0, 0], [left + width / 2, 0]));
    if (pos[0] !== object.pos[0] || pos[1] !== object.pos[1] || object.rot !== row.rot)
      tx.shift(object, pos, row.rot);
    left += width + ROW_GAP;
  }
}

/** Takes what was put in a bag out of sight: piles come apart, and every piece goes in. */
function bagUp(tx: Transaction, bag: SnapSpot): void {
  for (const object of occupants(tx.current(), bag.ref)) {
    const pieces = tx.piecesOf(object);
    if (object.kind === 'stack') tx.remove(object.id);
    for (const piece of pieces) {
      // Whatever rode on the piece stays on the table.
      for (const rider of tx.riders([piece.id])) tx.update(tx.get(rider), { snap: undefined });
      tx.update(piece, {
        bag: bag.ref,
        parent: undefined,
        snap: undefined,
        pos: bag.pos,
        rot: 0,
        z: 0,
        locked: undefined,
      });
    }
  }
}
