// What drop areas do with what landed in them, once a command has put things
// down: piles gather into one stack, rows close up left to right, and bags take
// their contents out of sight.
import type { Vec2 } from '@trayful/formats/browser';
import { objectSize } from './layout.js';
import { stack } from './pile-commands.js';
import { allSpots, occupants, toLocal, toTable, type SnapSpot } from './snap.js';
import type { Transaction } from './transaction.js';

/** Space between things lying in a row, in millimetres. */
const ROW_GAP = 2;

/**
 * Settles the piles, rows and bags a command put things into or took things out
 * of. The others are left as they are, so an old table never stops a command.
 */
export function settle(tx: Transaction): void {
  const touched = touchedSpots(tx);
  for (const spot of allSpots(tx.current(), tx.catalog)) {
    if (!touched.has(spot.ref)) continue;
    if (spot.mode === 'pile') gather(tx, spot);
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

/**
 * Lines up what lies in a row from its left end, in the order it lies from left
 * to right, each turned like the row. When it all does not fit, the things
 * overlap evenly so the last still ends at the right end.
 */
function lineUp(tx: Transaction, row: SnapSpot): void {
  const state = tx.current();
  const local = (pos: Vec2) => toLocal(row, [0, 0], pos)[0];
  const items = occupants(state, row.ref)
    .sort((a, b) => local(a.pos) - local(b.pos) || a.z - b.z)
    .map((object) => ({ object, width: objectSize(state, tx.catalog, object)[0] }));
  if (items.length === 0) return;
  const [rowWidth] = row.area!;
  const total = items.reduce((sum, i) => sum + i.width, 0) + ROW_GAP * (items.length - 1);
  // The space between neighbours; negative when they have to overlap.
  const squeeze =
    total > rowWidth && items.length > 1
      ? (rowWidth - total) / (items.length - 1) + ROW_GAP
      : ROW_GAP;
  let left = -rowWidth / 2;
  for (const { object, width } of items) {
    const pos = roundPos(toTable(row, [0, 0], [left + width / 2, 0]));
    if (pos[0] !== object.pos[0] || pos[1] !== object.pos[1] || object.rot !== row.rot)
      tx.shift(object, pos, row.rot);
    left += width + squeeze;
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

/** A position to a tenth of a millimetre, so a row that has settled stays put. */
function roundPos([x, y]: Vec2): Vec2 {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}
