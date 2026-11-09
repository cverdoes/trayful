import { holdsMany, sidesOf, type Vec2 } from '@trayful/formats/browser';
import { boundsOf } from '../table/layout.js';
import { roomIn, roomOn } from '../placement/room.js';
import { rowEnd, snapOwner, type SnapSpot } from '../placement/snap.js';
import { handTarget, sizeOf, type Piece, type TableObject } from '../table/state.js';
import { surfaceOf, surfaceTarget } from '../table/surfaces.js';
import { CommandError, unique, type Target, type Transaction } from './transaction.js';

/** The fields of a `move` command; see `Command` for what each does. */
interface MoveOptions {
  ids: string[];
  by?: Vec2;
  to?: Target;
  into?: string;
  face?: 'up' | 'down';
  surface?: string;
}

/** The objects a move carries, apart from those that ride along on another one. */
interface Group {
  /** In the order given, so the first object is the one that lands at `to`. */
  objects: TableObject[];
  /** The same objects from the bottom up, the order they are put down in. */
  byZ: TableObject[];
  /** Every object that moves, riders included. */
  moving: ReadonlySet<string>;
}

/** Moves objects by an offset, to a position or snap target, or into or out of a hand. */
export function move(tx: Transaction, options: MoveOptions): void {
  const { ids, by, to, into, face, surface } = options;
  if ((by === undefined) === (to === undefined))
    throw new CommandError('Give exactly one of "by" or "to".');
  if (surface !== undefined && (by !== undefined || typeof to === 'string'))
    throw new CommandError('Give "surface" only with a position in "to".');
  const given = unique(ids).map((id) => tx.topLevel(id));
  const locked = given.find((o) => o.locked);
  if (locked) throw new CommandError(`"${locked.id}" is locked.`);
  const player = handTarget(to);
  if (player !== undefined) {
    rejectInto(into);
    tx.toHand(handPieces(tx, given), player);
    return;
  }
  const held = given.filter((o): o is Piece => o.kind === 'piece' && !!o.hand);
  if (held.length > 0) {
    if (held.length !== given.length)
      throw new CommandError('Play pieces from a hand separately from pieces on the table.');
    if (by !== undefined || into !== undefined)
      throw new CommandError('Pieces in a hand have no table position; give "to".');
    playFromHand(tx, held, { to: to!, face: face ?? 'up', surface });
    return;
  }
  const group = groupOf(tx, given);
  if (typeof to === 'string') {
    rejectInto(into);
    const onto = surfaceTarget(to);
    if (onto === undefined) moveToTarget(tx, group, to);
    else moveToSurface(tx, group, tx.surface(onto));
  } else moveBy(tx, group, by ?? offsetTo(to!, group.objects[0]!), { into, surface });
}

/** A snap target or a hand already says where objects end up, so `into` would contradict it. */
function rejectInto(into: string | undefined): void {
  if (into !== undefined) throw new CommandError('Give "into" only with "by" or a position.');
}

/** The pieces that go into a hand: single pieces, and the cards of stacks, which are taken apart. */
function handPieces(tx: Transaction, given: TableObject[]): Piece[] {
  return given.flatMap((o) => {
    if (o.kind === 'piece') return [o];
    tx.remove(o.id);
    return tx.piecesOf(o).reverse();
  });
}

function groupOf(tx: Transaction, given: TableObject[]): Group {
  // Objects riding on another moved object travel with it rather than on their own.
  const riding = new Set(tx.riders(given.map((o) => o.id)));
  const objects = given.filter((o) => !riding.has(o.id));
  return {
    objects,
    byZ: [...objects].sort((a, b) => a.z - b.z),
    moving: new Set([...given.map((o) => o.id), ...riding]),
  };
}

/**
 * Moves a group into a snap target: one object per free spot (or pile), all
 * together into a free area or a bag, or one after another onto the end of a row.
 */
function moveToTarget(tx: Transaction, group: Group, to: string): void {
  const spots = tx.spots(to, group.objects, group.moving);
  const first = spots[0]!;
  const surface = surfaceOf(tx.get(first.owner));
  if (first.mode === 'row') {
    group.objects.forEach((object, i) =>
      tx.relocate(object, rowEnd(first, i), first.rot, { snap: first.ref, surface }),
    );
    return;
  }
  if (first.area) {
    // A bag takes things in where they are.
    const offset: Vec2 = first.mode === 'bag' ? [0, 0] : areaOffset(tx, first, group);
    for (const object of group.byZ)
      tx.relocate(object, add(object.pos, offset), object.rot, { snap: first.ref, surface });
    return;
  }
  const oneEach = spots.length > 1 && !holdsMany(first.mode);
  const places = oneEach ? spots.filter((s) => tx.isFree(s.ref, group.moving)) : spots;
  const count = group.objects.length;
  if (oneEach && places.length < count) {
    throw new CommandError(
      `"${to}" has ${places.length} free ${places.length === 1 ? 'spot' : 'spots'}; ` +
        `${count} ${count === 1 ? 'object needs' : 'objects need'} one each.`,
    );
  }
  group.objects.forEach((object, i) => {
    const spot = places[Math.min(i, places.length - 1)]!;
    tx.relocate(object, spot.pos, spot.rot, { snap: spot.ref, surface });
  });
}

/**
 * Shifts a group by an offset, optionally onto another surface, and optionally
 * recording the snap spot or area it now sits in.
 */
function moveBy(
  tx: Transaction,
  group: Group,
  offset: Vec2,
  { into, surface }: { into?: string; surface?: string },
): void {
  const snap = into === undefined ? undefined : intoSpot(tx, group, into);
  const host = snap === undefined ? undefined : surfaceOf(tx.get(snapOwner(snap)));
  if (surface !== undefined) tx.surface(surface);
  if (host !== undefined && surface !== undefined && host !== surface)
    throw new CommandError(`"${into!}" is on another surface than "${surface}".`);
  for (const object of group.byZ) {
    tx.relocate(object, add(object.pos, offset), object.rot, {
      snap: snap ?? kept(object, group),
      surface: host ?? surface ?? surfaceOf(object),
    });
  }
}

/** The spot an object keeps: its own, when the piece it sits on moves with it. */
function kept(object: TableObject, group: Group): string | undefined {
  return object.snap && group.moving.has(snapOwner(object.snap)) ? object.snap : undefined;
}

/** Moves a group to free room on a surface, keeping its shape. */
function moveToSurface(tx: Transaction, group: Group, surface: string): void {
  const box = boundsOf(tx.current(), tx.catalog, group.objects);
  const size: Vec2 = [box.x1 - box.x0, box.y1 - box.y0];
  const target = roomOn(tx.current(), tx.catalog, surface, { size, ignore: group.moving });
  const offset: Vec2 = [target[0] - (box.x0 + box.x1) / 2, target[1] - (box.y0 + box.y1) / 2];
  for (const object of group.byZ)
    tx.relocate(object, add(object.pos, offset), object.rot, {
      snap: kept(object, group),
      surface,
    });
}

function intoSpot(tx: Transaction, group: Group, into: string): string {
  const spots = tx.spots(into, group.objects, group.moving);
  if (spots.length !== 1) {
    throw new CommandError(`"into" needs one spot or area, such as "${spots[0]!.ref}".`);
  }
  return spots[0]!.ref;
}

/**
 * How far to shift a group so it lands in a free area while keeping its shape:
 * in the middle, or in the first room clear of what already lies there.
 */
function areaOffset(tx: Transaction, area: SnapSpot, group: Group): Vec2 {
  const box = boundsOf(tx.current(), tx.catalog, group.objects);
  const centre: Vec2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const size: Vec2 = [box.x1 - box.x0, box.y1 - box.y0];
  const target = roomIn(tx.current(), tx.catalog, area, { size, ignore: group.moving });
  return [target[0] - centre[0], target[1] - centre[1]];
}

/** Lays pieces from a hand on the table side by side, the first at `to`. */
function playFromHand(
  tx: Transaction,
  pieces: Piece[],
  { to, face, surface }: { to: Target; face: 'up' | 'down'; surface?: string },
): void {
  const place = tx.place(to, pieces, surface);
  if (place.hand !== undefined) {
    tx.toHand(pieces, place.hand);
    return;
  }
  let x = place.pos[0];
  let z = tx.topZ();
  pieces.forEach((piece, i) => {
    const type = tx.typeOf(piece);
    const [w] = sizeOf(type);
    if (i > 0) x += w / 2;
    tx.update(piece, {
      hand: undefined,
      pos: [x, place.pos[1]],
      rot: place.rot ?? 0,
      z: z++,
      face: sidesOf(type) === 2 ? face : piece.face,
      snap: pieces.length === 1 ? place.snap : undefined,
      surface: place.surface,
    });
    x += w / 2 + 2;
  });
}

/** The offset that brings `object` to the position `to`. */
function offsetTo(to: Vec2, object: TableObject): Vec2 {
  return [to[0] - object.pos[0], to[1] - object.pos[1]];
}

function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}
