import { PRIMITIVE_INFO, type Vec2 } from '@trayful/formats/browser';
import { objectSize, type StackLayout } from './layout.js';
import { nextInt, shuffled } from './rng.js';
import {
  accepts,
  occupants,
  resolveSpots,
  ridersOf,
  snapOwner,
  SnapError,
  toLocal,
  toTable,
  type SnapSpot,
} from './snap.js';
import type { Catalog, Piece, Stack, TableObject, TableState } from './state.js';

/**
 * Where something goes: an `[x, y]` position in millimetres, or a snap target
 * such as `main-board/market/2` (one spot) or `main-board/market` (the target's
 * spots, filled in order, or its free area).
 */
export type Target = Vec2 | string;

/**
 * Every change to a table is one of these commands. The UI and the MCP server
 * both send commands, so they share validation, undo and the history log.
 */
export type Command =
  /**
   * Move objects by an offset, or move them to a target. With a position the first
   * object goes there and the others keep their places relative to it; with a snap
   * target each object takes the next free spot. `into` records that the moved
   * objects now sit in a snap spot or area, without changing where they land.
   * Pieces snapped onto a moved object ride along with it.
   */
  | { type: 'move'; ids: string[]; by?: Vec2; to?: Target; into?: string }
  /** Turn objects over. Flipping a stack turns the whole pile over, reversing its order. */
  | { type: 'flip'; ids: string[] }
  /** Rotate by whole steps of the type's `rotationStep` (default 90°), or by free degrees. */
  | { type: 'rotate'; ids: string[]; steps?: number; degrees?: number }
  /** Put objects on top of a piece or stack, in the order given (last ends on top). */
  | { type: 'stack'; ids: string[]; onto: string }
  /** Take cards off the top of a stack to a target. Several cards land as a new stack. */
  | { type: 'draw'; from: string; count?: number; to: Target; face?: 'up' | 'down' }
  /**
   * Deal cards from the top of a stack, one at a time to each target in turn, for
   * `count` rounds. A whole snap target such as `main-board/market` counts as each
   * of its spots. Cards dealt to the same place form a pile.
   */
  | { type: 'deal'; from: string; to: Target | Target[]; count?: number; face?: 'up' | 'down' }
  /** Take one particular piece out of a stack, wherever it is in the pile. */
  | { type: 'take'; id: string; to: Target; face?: 'up' | 'down' }
  /** Change how a stack's pieces lie: in a pile, a fan, or spread out side by side. */
  | { type: 'layout'; id: string; layout: StackLayout }
  | { type: 'shuffle'; id: string }
  | { type: 'roll'; id: string }
  /** Set a counter's number or a die's face. */
  | { type: 'setValue'; id: string; value: number | string }
  | { type: 'lock'; ids: string[]; locked: boolean };

export type CommandType = Command['type'];

export class CommandError extends Error {}

/** Space left between groups of pieces put into the same free area, in millimetres. */
const AREA_GAP = 4;

/** Applies a command and returns the new state. The input state is never modified. */
export function applyCommand(state: TableState, command: Command, catalog: Catalog): TableState {
  const tx = new Transaction(state, catalog);
  switch (command.type) {
    case 'move':
      tx.move(command.ids, command.by, command.to, command.into);
      break;
    case 'flip':
      for (const id of unique(command.ids)) tx.flip(id);
      break;
    case 'rotate':
      for (const id of unique(command.ids)) tx.rotate(id, command.steps, command.degrees);
      break;
    case 'stack':
      tx.stack(command.ids, command.onto);
      break;
    case 'draw':
      tx.draw(command.from, command.count ?? 1, command.to, command.face);
      break;
    case 'deal':
      tx.deal(command.from, command.to, command.count ?? 1, command.face);
      break;
    case 'take':
      tx.take(command.id, command.to, command.face);
      break;
    case 'layout':
      tx.layout(command.id, command.layout);
      break;
    case 'shuffle':
      tx.shuffle(command.id);
      break;
    case 'roll':
      tx.roll(command.id);
      break;
    case 'setValue':
      tx.setValue(command.id, command.value);
      break;
    case 'lock':
      for (const id of unique(command.ids))
        tx.update(tx.topLevel(id), { locked: command.locked || undefined });
      break;
    default:
      throw new CommandError(`Unknown command "${(command as { type: string }).type}".`);
  }
  return tx.commit();
}

function unique(ids: string[]): string[] {
  if (ids.length === 0) throw new CommandError('No objects given.');
  return [...new Set(ids)];
}

/** Copy-on-write helper: touched objects are copied, everything else is shared with the old state. */
class Transaction {
  private objects: Record<string, TableObject>;
  private rng: number;

  constructor(
    private readonly state: TableState,
    private readonly catalog: Catalog,
  ) {
    this.objects = { ...state.objects };
    this.rng = state.rng;
  }

  commit(): TableState {
    // A piece snapped to something that is gone, or now inside a stack, no longer sits in its spot.
    for (const object of Object.values(this.objects)) {
      if (!object.snap) continue;
      const owner = this.objects[snapOwner(object.snap)];
      const inStack = object.kind === 'piece' && object.parent;
      if (inStack || owner?.kind !== 'piece' || owner.parent)
        this.update(object, { snap: undefined });
    }
    return { ...this.state, rng: this.rng, objects: this.objects };
  }

  /** The table as it stands in this transaction. */
  private current(): TableState {
    return { ...this.state, objects: this.objects };
  }

  get(id: string): TableObject {
    const object = this.objects[id];
    if (!object) throw new CommandError(`No object with id "${id}".`);
    return object;
  }

  /** An object that sits directly on the table (not inside a stack). */
  topLevel(id: string): TableObject {
    const object = this.get(id);
    if (object.kind === 'piece' && object.parent) {
      throw new CommandError(`"${id}" is inside stack "${object.parent}"; draw it first.`);
    }
    return object;
  }

  piece(id: string): Piece {
    const object = this.topLevel(id);
    if (object.kind !== 'piece') throw new CommandError(`"${id}" is a stack, not a single piece.`);
    return object;
  }

  stackObject(id: string): Stack {
    const object = this.get(id);
    if (object.kind !== 'stack') throw new CommandError(`"${id}" is not a stack.`);
    return object;
  }

  typeOf(piece: Piece) {
    const type = this.catalog[piece.type];
    if (!type) throw new CommandError(`Unknown component type "${piece.type}".`);
    return type;
  }

  update<T extends TableObject>(object: T, changes: Partial<T>): T {
    const next = { ...object, ...changes } as T;
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k];
    }
    this.objects[object.id] = next;
    return next;
  }

  private topZ(): number {
    let max = -1;
    for (const object of Object.values(this.objects)) {
      if (!(object.kind === 'piece' && object.parent)) max = Math.max(max, object.z);
    }
    return max + 1;
  }

  // -------------------------------------------------------------------------

  move(ids: string[], by?: Vec2, to?: Target, into?: string): void {
    if ((by === undefined) === (to === undefined))
      throw new CommandError('Give exactly one of "by" or "to".');
    const given = unique(ids).map((id) => this.topLevel(id));
    for (const object of given) {
      if (object.locked) throw new CommandError(`"${object.id}" is locked.`);
    }
    // Objects riding on another moved object travel with it rather than on their own.
    const riding = new Set(
      ridersOf(
        this.objects,
        given.map((o) => o.id),
      ),
    );
    // Kept in the order given, so the first object is the one that lands at `to`.
    const objects = given.filter((o) => !riding.has(o.id));
    const byZ = [...objects].sort((a, b) => a.z - b.z);
    const moving = new Set([...given.map((o) => o.id), ...riding]);

    if (typeof to === 'string') {
      if (into !== undefined) throw new CommandError('Give "into" only with "by" or a position.');
      const spots = this.spots(to, objects, moving);
      if (spots[0]!.area) {
        const offset = this.areaOffset(spots[0]!, objects, moving);
        for (const object of byZ) {
          this.relocate(object, add(object.pos, offset), object.rot, spots[0]!.ref);
        }
        return;
      }
      let places = spots;
      if (spots.length > 1) {
        places = spots.filter((s) => this.isFree(s.ref, moving));
        if (places.length < objects.length) {
          throw new CommandError(
            `"${to}" has ${places.length} free ${places.length === 1 ? 'spot' : 'spots'}; ` +
              `${objects.length} ${objects.length === 1 ? 'object needs' : 'objects need'} one each.`,
          );
        }
      }
      objects.forEach((object, i) => {
        const spot = places[Math.min(i, places.length - 1)]!;
        this.relocate(object, spot.pos, spot.rot, spot.ref);
      });
      return;
    }

    let snap: string | undefined;
    if (into !== undefined) {
      const spots = this.spots(into, objects, moving);
      if (spots.length !== 1) {
        throw new CommandError(`"into" needs one spot or area, such as "${spots[0]!.ref}".`);
      }
      snap = spots[0]!.ref;
    }
    const offset: Vec2 = by ?? [to![0] - objects[0]!.pos[0], to![1] - objects[0]!.pos[1]];
    for (const object of byZ) {
      // Objects keep their spot when the piece they sit on moves with them.
      const keep = object.snap && moving.has(snapOwner(object.snap)) ? object.snap : undefined;
      this.relocate(object, add(object.pos, offset), object.rot, snap ?? keep);
    }
  }

  /**
   * How far to shift a group so it lands in a free area while keeping its shape:
   * centred in the area, or below what already lies there.
   */
  private areaOffset(area: SnapSpot, objects: TableObject[], moving: ReadonlySet<string>): Vec2 {
    const box = (list: TableObject[]) => {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const o of list) {
        const [w, h] = objectSize(this.current(), this.catalog, o);
        [x0, y0] = [Math.min(x0, o.pos[0] - w / 2), Math.min(y0, o.pos[1] - h / 2)];
        [x1, y1] = [Math.max(x1, o.pos[0] + w / 2), Math.max(y1, o.pos[1] + h / 2)];
      }
      return { x0, y0, x1, y1 };
    };
    const group = box(objects);
    const centre: Vec2 = [(group.x0 + group.x1) / 2, (group.y0 + group.y1) / 2];
    let target = area.pos;
    const others = occupants(this.current(), area.ref).filter((o) => !moving.has(o.id));
    if (others.length > 0) {
      const below = box(others).y1 + AREA_GAP + (group.y1 - group.y0) / 2;
      target = [area.pos[0], below];
    }
    return [target[0] - centre[0], target[1] - centre[1]];
  }

  /**
   * Puts an object at a new position and rotation on top of everything, carrying
   * the pieces that ride on it so they keep their place relative to it.
   */
  private relocate(object: TableObject, pos: Vec2, rot: number, snap: string | undefined): void {
    const riders = ridersOf(this.objects, [object.id])
      .map((id) => this.objects[id]!)
      .sort((a, b) => a.z - b.z);
    const delta = rot - object.rot;
    let z = this.topZ();
    this.update(object, { pos, rot: normalize(rot), z: z++, snap });
    for (const rider of riders) {
      const local = toLocal(object, [0, 0], rider.pos);
      this.update(rider, {
        pos: toTable({ pos, rot }, [0, 0], local),
        rot: normalize(rider.rot + delta),
        z: z++,
      });
    }
  }

  /**
   * Resolves a snap target, checking that every given object may go there and
   * that nothing is being put onto itself.
   */
  private spots(ref: string, objects: TableObject[], moving: ReadonlySet<string>): SnapSpot[] {
    let spots: SnapSpot[];
    try {
      spots = resolveSpots(this.current(), this.catalog, ref);
    } catch (error) {
      if (error instanceof SnapError) throw new CommandError(error.message);
      throw error;
    }
    const owner = spots[0]!.owner;
    if (moving.has(owner)) throw new CommandError(`Cannot put "${owner}" onto itself.`);
    for (const object of objects) {
      const pieces =
        object.kind === 'stack' ? object.items.map((i) => this.get(i) as Piece) : [object];
      for (const piece of pieces) {
        const type = this.typeOf(piece);
        if (!accepts(spots[0]!, type)) {
          const name = `${spots[0]!.owner}/${spots[0]!.target}`;
          throw new CommandError(
            `"${name}" only accepts ${spots[0]!.accepts!.join(', ')}, not ${type.id} ("${piece.id}").`,
          );
        }
      }
    }
    return spots;
  }

  private isFree(ref: string, ignore: ReadonlySet<string> = new Set()): boolean {
    return occupants(this.current(), ref).every((o) => ignore.has(o.id));
  }

  /**
   * The places a target names, for pieces about to land there: a position, one
   * spot, or every spot of a snap target (its centre, for a free area).
   */
  private places(target: Target, pieces: Piece[]): { pos: Vec2; rot?: number; snap?: string }[] {
    if (typeof target !== 'string') {
      if (!isVec2(target)) throw new CommandError('A position must be an [x, y] pair.');
      return [{ pos: target }];
    }
    return this.spots(target, pieces, new Set()).map((s) => ({
      pos: s.pos,
      rot: s.area ? undefined : s.rot,
      snap: s.ref,
    }));
  }

  /** One place for pieces that land together: a position, a spot, or a snap target's first free spot. */
  private place(target: Target, pieces: Piece[]): { pos: Vec2; rot?: number; snap?: string } {
    const places = this.places(target, pieces);
    if (places.length === 1) return places[0]!;
    const free = places.find((p) => this.isFree(p.snap!));
    if (!free) throw new CommandError(`Every spot of "${target as string}" is taken.`);
    return free;
  }

  flip(id: string): void {
    const object = this.topLevel(id);
    if (object.kind === 'stack') {
      for (const pieceId of object.items) {
        const piece = this.get(pieceId) as Piece;
        this.requireTwoSided(piece);
        this.update(piece, { face: piece.face === 'up' ? 'down' : 'up' });
      }
      this.update(object, { items: [...object.items].reverse() });
      return;
    }
    this.requireTwoSided(object);
    this.update(object, { face: object.face === 'up' ? 'down' : 'up' });
  }

  private requireTwoSided(piece: Piece): void {
    const type = this.typeOf(piece);
    if (PRIMITIVE_INFO[type.base].sides !== 2) {
      throw new CommandError(`"${piece.id}" is a ${type.base} and has only one side.`);
    }
  }

  rotate(id: string, steps?: number, degrees?: number): void {
    if ((steps === undefined) === (degrees === undefined)) {
      throw new CommandError('Give exactly one of "steps" or "degrees".');
    }
    const object = this.topLevel(id);
    const step =
      object.kind === 'piece'
        ? (this.typeOf(object).rotationStep ?? 90)
        : (this.typeOf(this.get(object.items[0]!) as Piece).rotationStep ?? 90);
    const delta = degrees ?? steps! * step;
    this.relocate(object, object.pos, object.rot + delta, object.snap);
  }

  stack(ids: string[], ontoId: string): void {
    const sources = unique(ids).map((id) => this.topLevel(id));
    if (sources.some((s) => s.id === ontoId))
      throw new CommandError('Cannot stack an object onto itself.');
    let target = this.topLevel(ontoId);
    for (const source of [target, ...sources]) {
      const pieces =
        source.kind === 'stack' ? source.items.map((i) => this.get(i) as Piece) : [source];
      for (const piece of pieces) {
        const type = this.typeOf(piece);
        if (!PRIMITIVE_INFO[type.base].stackable) {
          throw new CommandError(`"${piece.id}" is a ${type.base}, which cannot be stacked.`);
        }
      }
    }
    if (target.kind === 'piece') {
      // Turn the target piece into a one-card stack where it lies.
      const stackId = this.newStackId();
      const stack: Stack = {
        kind: 'stack',
        id: stackId,
        pos: target.pos,
        rot: target.rot,
        z: target.z,
        items: [target.id],
      };
      if (target.snap) stack.snap = target.snap;
      this.objects[stackId] = stack;
      this.update(target, { parent: stackId, snap: undefined });
      target = stack;
    }
    const items = [...target.items];
    for (const source of sources) {
      if (source.kind === 'stack') {
        for (const pieceId of source.items)
          this.update(this.get(pieceId) as Piece, { parent: target.id });
        items.push(...source.items);
        delete this.objects[source.id];
      } else {
        this.update(source, { parent: target.id, snap: undefined });
        items.push(source.id);
      }
    }
    this.update(target, { items, z: this.topZ() });
  }

  draw(fromId: string, count: number, to: Target, face?: 'up' | 'down'): void {
    if (!Number.isInteger(count) || count < 1)
      throw new CommandError('"count" must be a whole number of at least 1.');
    const stack = this.stackObject(fromId);
    if (count > stack.items.length) {
      throw new CommandError(
        `"${fromId}" holds ${stack.items.length} pieces; cannot draw ${count}.`,
      );
    }
    // The top piece lands first, so the drawn pile keeps the stack's order reversed,
    // as when dealing cards one at a time onto a pile.
    const drawn = stack.items.slice(stack.items.length - count).reverse();
    const place = this.place(
      to,
      drawn.map((id) => this.get(id) as Piece),
    );
    this.land([drawn], [place], stack, face);
    this.setStackItems(stack, stack.items.slice(0, stack.items.length - count));
  }

  deal(fromId: string, to: Target | Target[], rounds: number, face?: 'up' | 'down'): void {
    if (!Number.isInteger(rounds) || rounds < 1)
      throw new CommandError('"count" must be a whole number of at least 1.');
    const stack = this.stackObject(fromId);
    const targets: Target[] =
      typeof to === 'string' || isVec2(to) ? [to] : Array.isArray(to) ? to : [];
    if (targets.length === 0) throw new CommandError('Give at least one place to deal to.');
    const cards = stack.items.map((id) => this.get(id) as Piece);
    const places = targets.flatMap((t) => this.places(t, cards));
    const total = rounds * places.length;
    if (total > stack.items.length) {
      throw new CommandError(
        `"${fromId}" holds ${stack.items.length} cards; dealing ${rounds} to ${places.length} ` +
          `${places.length === 1 ? 'place' : 'places'} needs ${total}.`,
      );
    }
    // Cards come off the top (the end of `items`) and land bottom first on each pile.
    const order = stack.items.slice(stack.items.length - total).reverse();
    const piles: string[][] = places.map(() => []);
    order.forEach((id, i) => piles[i % places.length]!.push(id));
    this.land(piles, places, stack, face);
    this.setStackItems(stack, stack.items.slice(0, stack.items.length - total));
  }

  take(id: string, to: Target, face?: 'up' | 'down'): void {
    const piece = this.get(id);
    if (piece.kind !== 'piece') throw new CommandError(`"${id}" is a stack; use draw or move.`);
    if (!piece.parent) throw new CommandError(`"${id}" is not in a stack; use move.`);
    const stack = this.stackObject(piece.parent);
    const place = this.place(to, [piece]);
    this.land([[id]], [place], stack, face);
    this.setStackItems(
      stack,
      stack.items.filter((i) => i !== id),
    );
  }

  layout(id: string, layout: StackLayout): void {
    if (!['pile', 'fan', 'spread'].includes(layout))
      throw new CommandError('"layout" must be pile, fan or spread.');
    const stack = this.stackObject(id);
    this.update(stack, { layout: layout === 'pile' ? undefined : layout });
  }

  /** Puts piles of pieces taken from `from` at their places; piles of several become stacks. */
  private land(
    piles: string[][],
    places: { pos: Vec2; rot?: number; snap?: string }[],
    from: Stack,
    face?: 'up' | 'down',
  ): void {
    let z = this.topZ();
    piles.forEach((pile, i) => {
      const { pos, rot = from.rot, snap } = places[i]!;
      for (const pieceId of pile) {
        const piece = this.get(pieceId) as Piece;
        this.update(piece, {
          parent: undefined,
          pos,
          rot,
          z: z++,
          face: face ?? piece.face,
          snap: pile.length === 1 ? snap : undefined,
        });
      }
      if (pile.length > 1) {
        const stackId = this.newStackId();
        const stack: Stack = { kind: 'stack', id: stackId, pos, rot, z: z++, items: pile };
        if (snap) stack.snap = snap;
        this.objects[stackId] = stack;
        for (const pieceId of pile)
          this.update(this.get(pieceId) as Piece, { parent: stackId, z: 0 });
      }
    });
  }

  /** Updates a stack's items, dissolving it when one or no pieces remain. */
  private setStackItems(stack: Stack, items: string[]): void {
    if (items.length > 1) {
      this.update(stack, { items });
      return;
    }
    delete this.objects[stack.id];
    const last = items[0];
    if (last) {
      this.update(this.get(last) as Piece, {
        parent: undefined,
        pos: stack.pos,
        rot: stack.rot,
        z: stack.z,
        snap: stack.snap,
      });
    }
  }

  shuffle(id: string): void {
    const stack = this.stackObject(id);
    const [items, rng] = shuffled(stack.items, this.rng);
    this.rng = rng;
    this.update(stack, { items });
  }

  roll(id: string): void {
    const piece = this.piece(id);
    const type = this.typeOf(piece);
    if (type.base !== 'die') throw new CommandError(`"${id}" is a ${type.base}, not a die.`);
    const faces = type.faces ?? [1, 2, 3, 4, 5, 6];
    const [index, rng] = nextInt(this.rng, faces.length);
    this.rng = rng;
    this.update(piece, { value: faces[index]! });
  }

  setValue(id: string, value: number | string): void {
    const piece = this.piece(id);
    const type = this.typeOf(piece);
    if (type.base === 'counter') {
      const [min, max] = type.range ?? [0, 99];
      if (typeof value !== 'number' || !Number.isInteger(value))
        throw new CommandError('A counter value must be a whole number.');
      this.update(piece, { value: Math.min(max, Math.max(min, value)) });
    } else if (type.base === 'die') {
      const faces = type.faces ?? [1, 2, 3, 4, 5, 6];
      if (!faces.includes(value)) throw new CommandError(`"${value}" is not a face of "${id}".`);
      this.update(piece, { value });
    } else {
      throw new CommandError(`"${id}" is a ${type.base}; only counters and dice have a value.`);
    }
  }

  private newStackId(): string {
    let n = 1;
    while (this.objects[`stack:${n}`]) n++;
    return `stack:${n}`;
  }
}

function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function isVec2(value: unknown): value is Vec2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  );
}
