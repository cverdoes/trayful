import { holdsMany, type Vec2 } from '@trayful/formats/browser';
import { roomIn } from './room.js';
import {
  accepts,
  occupants,
  resolveSpots,
  ridersOf,
  rowEnd,
  snapOwner,
  SnapError,
  toLocal,
  toTable,
  type SnapSpot,
} from './snap.js';
import {
  handTarget,
  onTable,
  removeObject,
  sizeOf,
  type Catalog,
  type Piece,
  type Stack,
  type TableObject,
  type TableState,
  withChanges,
} from './state.js';

/**
 * Where something goes: an `[x, y]` position in millimetres, a snap target such
 * as `main-board/market/2` (one spot) or `main-board/market` (the target's spots,
 * filled in order, or its free area), or a player's private hand as `hand:<player>`.
 */
export type Target = Vec2 | string;

export class CommandError extends Error {}

/** Where pieces land: a table position (with a spot's rotation and reference), or a hand. */
export interface Place {
  pos: Vec2;
  rot?: number;
  snap?: string;
  hand?: string;
  /** A pile or group spot, which takes more pieces when something already lies there. */
  shared?: boolean;
}

/**
 * Copy-on-write view of a table while a command runs: touched objects are
 * copied, everything else is shared with the old state. The commands build on
 * the lookups and moves here.
 */
export class Transaction {
  private readonly objects: Record<string, TableObject>;
  private rng: number;

  constructor(
    private readonly state: TableState,
    readonly catalog: Catalog,
  ) {
    this.objects = { ...state.objects };
    this.rng = state.rng;
  }

  commit(): TableState {
    // A piece snapped to something that is gone, or now inside a stack, no longer sits in its spot.
    for (const object of Object.values(this.objects)) {
      if (!object.snap) continue;
      const owner = this.objects[snapOwner(object.snap)];
      if (!onTable(object) || owner?.kind !== 'piece' || owner.parent || owner.hand)
        this.update(object, { snap: undefined });
    }
    return { ...this.state, rng: this.rng, objects: this.objects };
  }

  /** Every object the command added, removed or changed so far, as it was and as it is. */
  changes(): { before?: TableObject; after?: TableObject }[] {
    const ids = new Set([...Object.keys(this.objects), ...Object.keys(this.state.objects)]);
    return [...ids]
      .filter((id) => this.objects[id] !== this.state.objects[id])
      .map((id) => ({ before: this.state.objects[id], after: this.objects[id] }));
  }

  /** The table as it stands in this transaction. */
  current(): TableState {
    return { ...this.state, objects: this.objects };
  }

  /** Runs a random draw, such as a shuffle or a roll, and keeps the generator's new state. */
  random<T>(draw: (rng: number) => [T, number]): T {
    const [result, rng] = draw(this.rng);
    this.rng = rng;
    return result;
  }

  // Lookups ------------------------------------------------------------------

  get(id: string): TableObject {
    const object = this.objects[id];
    if (!object) throw new CommandError(`No object with id "${id}".`);
    return object;
  }

  /** An object that sits directly on the table (not inside a stack or a bag). */
  topLevel(id: string): TableObject {
    const object = this.get(id);
    if (object.kind === 'piece' && object.parent) {
      throw new CommandError(`"${id}" is inside stack "${object.parent}"; draw it first.`);
    }
    if (object.kind === 'piece' && object.bag) {
      throw new CommandError(`"${id}" is in bag "${object.bag}"; draw from the bag instead.`);
    }
    return object;
  }

  /** An object lying on the table itself: not in a stack, and not in anyone's hand. */
  onTable(id: string): TableObject {
    const object = this.topLevel(id);
    if (object.kind === 'piece' && object.hand) {
      throw new CommandError(`"${id}" is in a player's hand; play it to the table first.`);
    }
    return object;
  }

  piece(id: string): Piece {
    const object = this.onTable(id);
    if (object.kind !== 'piece') throw new CommandError(`"${id}" is a stack, not a single piece.`);
    return object;
  }

  /** A piece in a stack, by id. */
  stackItem(id: string): Piece {
    return this.get(id) as Piece;
  }

  stackObject(id: string): Stack {
    const object = this.get(id);
    if (object.kind !== 'stack') throw new CommandError(`"${id}" is not a stack.`);
    return object;
  }

  /** The pieces in a bag, by id, so a random draw does not depend on the order they went in. */
  bagged(ref: string): Piece[] {
    return Object.values(this.objects)
      .filter((o): o is Piece => o.kind === 'piece' && o.bag === ref)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  /** The pieces an object is made of: itself, or a stack's items from the bottom up. */
  piecesOf(object: TableObject): Piece[] {
    return object.kind === 'stack' ? object.items.map((i) => this.stackItem(i)) : [object];
  }

  typeOf(piece: Piece) {
    const type = this.catalog[piece.type];
    if (!type) throw new CommandError(`Unknown component "${piece.type}".`);
    return type;
  }

  /** Ids of the objects that ride on the given ones, directly or on another rider. */
  riders(ids: Iterable<string>): string[] {
    return ridersOf(this.objects, ids);
  }

  // Changes ------------------------------------------------------------------

  update<T extends TableObject>(object: T, changes: Partial<T>): T {
    const next = withChanges(object, changes);
    this.objects[object.id] = next;
    return next;
  }

  add(object: TableObject): void {
    this.objects[object.id] = object;
  }

  remove(id: string): void {
    removeObject(this.objects, id);
  }

  topZ(): number {
    let max = -1;
    for (const object of Object.values(this.objects)) {
      if (onTable(object)) max = Math.max(max, object.z);
    }
    return max + 1;
  }

  newStackId(): string {
    let n = 1;
    while (this.objects[`stack:${n}`]) n++;
    return `stack:${n}`;
  }

  /**
   * Puts an object at a new position and rotation on top of everything, carrying
   * the pieces that ride on it so they keep their place relative to it.
   */
  relocate(object: TableObject, pos: Vec2, rot: number, snap: string | undefined): void {
    this.carry(object, { pos, rot, snap, z: this.topZ() });
  }

  /**
   * Moves an object within its spot without bringing it to the top, as a row does
   * when it closes up, carrying its riders.
   */
  shift(object: TableObject, pos: Vec2, rot: number): void {
    this.carry(object, { pos, rot, snap: object.snap, z: object.z });
  }

  private carry(
    object: TableObject,
    to: { pos: Vec2; rot: number; snap: string | undefined; z: number },
  ): void {
    const riders = this.riders([object.id])
      .map((id) => this.get(id))
      .sort((a, b) => a.z - b.z);
    const { pos, rot } = to;
    const delta = rot - object.rot;
    let z = to.z;
    this.update(object, { pos, rot: normalize(rot), z: z++, snap: to.snap, hand: undefined });
    for (const rider of riders) {
      const local = toLocal(object, [0, 0], rider.pos);
      this.update(rider, {
        pos: toTable({ pos, rot }, [0, 0], local),
        rot: normalize(rider.rot + delta),
        z: z++,
      });
    }
  }

  /** Puts pieces into a player's hand, after what the hand already holds. */
  toHand(pieces: Piece[], player: string): void {
    checkPlayer(player);
    let z = 0;
    for (const object of Object.values(this.objects)) {
      if (object.kind === 'piece' && object.hand === player) z = Math.max(z, object.z + 1);
    }
    for (const piece of pieces) {
      if (this.typeOf(piece).is === 'zone') {
        throw new CommandError(`"${piece.id}" is a zone, which cannot go in a hand.`);
      }
      if (piece.locked)
        throw new CommandError(`"${piece.id}" is locked, so it stays on the table.`);
      // Whatever rode on the piece stays on the table.
      for (const rider of this.riders([piece.id])) {
        this.update(this.get(rider), { snap: undefined });
      }
      this.update(piece, { hand: player, parent: undefined, snap: undefined, z: z++ });
    }
  }

  // Places -------------------------------------------------------------------

  /**
   * Resolves a snap target, checking that every given object may go there and
   * that nothing is being put onto itself.
   */
  spots(ref: string, objects: TableObject[], moving: ReadonlySet<string>): SnapSpot[] {
    let spots: SnapSpot[];
    try {
      spots = resolveSpots(this.current(), this.catalog, ref);
    } catch (error) {
      if (error instanceof SnapError) throw new CommandError(error.message);
      throw error;
    }
    const first = spots[0]!;
    if (moving.has(first.owner)) throw new CommandError(`Cannot put "${first.owner}" onto itself.`);
    for (const piece of objects.flatMap((o) => this.piecesOf(o))) {
      const type = this.typeOf(piece);
      if (!accepts(first, type)) {
        throw new CommandError(
          `"${first.owner}/${first.target}" only accepts ${first.accepts!.join(', ')}, not ${type.id} ("${piece.id}").`,
        );
      }
    }
    return spots;
  }

  isFree(ref: string, ignore: ReadonlySet<string> = new Set()): boolean {
    return occupants(this.current(), ref).every((o) => ignore.has(o.id));
  }

  /**
   * The places a target names, for pieces about to land there: a position, one
   * spot, or every spot of a snap target (its centre, for a free area).
   */
  places(target: Target, pieces: Piece[]): Place[] {
    if (typeof target !== 'string') {
      if (!isVec2(target)) throw new CommandError('A position must be an [x, y] pair.');
      return [{ pos: target }];
    }
    const player = handTarget(target);
    if (player !== undefined) return [{ pos: [0, 0], hand: checkPlayer(player) }];
    return this.spots(target, pieces, new Set()).map((s) => ({
      pos: this.landing(s, pieces),
      rot: s.area ? undefined : s.rot,
      snap: s.ref,
      shared: holdsMany(s.mode),
    }));
  }

  /** Where pieces land in a spot: after the end of a row, in free room in an area, or on the spot. */
  private landing(spot: SnapSpot, pieces: Piece[]): Vec2 {
    if (spot.mode === 'row') return rowEnd(spot);
    if (spot.mode !== 'free') return spot.pos;
    const sizes = pieces.map((p) => sizeOf(this.typeOf(p)));
    const size: Vec2 = [Math.max(...sizes.map((s) => s[0])), Math.max(...sizes.map((s) => s[1]))];
    return roomIn(this.current(), this.catalog, spot, {
      size,
      ignore: new Set(pieces.map((p) => p.id)),
    });
  }

  /**
   * One place for pieces that land together: a position, a spot, or a snap
   * target's first free spot (or its first pile or group, when every spot is taken).
   */
  place(target: Target, pieces: Piece[]): Place {
    const places = this.places(target, pieces);
    if (places.length === 1) return places[0]!;
    const free = places.find((p) => p.snap && (this.isFree(p.snap) || p.shared));
    if (!free) throw new CommandError(`Every spot of "${target as string}" is taken.`);
    return free;
  }
}

/** The ids without repeats; a command needs at least one. */
export function unique(ids: string[]): string[] {
  if (ids.length === 0) throw new CommandError('No objects given.');
  return [...new Set(ids)];
}

function checkPlayer(player: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(player)) {
    throw new CommandError(`"hand:${player}" does not name a player.`);
  }
  return player;
}

export function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}
