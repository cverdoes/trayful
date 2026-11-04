import { isStackable, stacksWith, type ComponentType } from '@trayful/formats/browser';
import type { StackLayout } from './layout.js';
import { shuffled } from './rng.js';
import type { Stack, TableObject } from './state.js';
import {
  CommandError,
  isVec2,
  unique,
  type Place,
  type Target,
  type Transaction,
} from './transaction.js';

type Face = 'up' | 'down';

/** Puts objects on top of a piece or stack, in the order given (last ends on top). */
export function stack(tx: Transaction, ids: string[], ontoId: string): void {
  const sources = unique(ids).map((id) => tx.topLevel(id));
  if (sources.some((s) => s.id === ontoId))
    throw new CommandError('Cannot stack an object onto itself.');
  const onto = tx.onTable(ontoId);
  checkStackable(tx, [onto, ...sources]);
  const target = asStack(tx, onto);
  const items = [...target.items];
  for (const source of sources) {
    if (source.kind === 'stack') {
      for (const piece of tx.piecesOf(source)) tx.update(piece, { parent: target.id });
      items.push(...source.items);
      tx.remove(source.id);
    } else {
      tx.update(source, { parent: target.id, snap: undefined, hand: undefined });
      items.push(source.id);
    }
  }
  tx.update(target, { items, z: tx.topZ() });
}

/** Every piece must be stackable, and every kind of piece must stack with every other. */
function checkStackable(tx: Transaction, objects: TableObject[]): void {
  const kinds = new Map<string, { type: ComponentType; piece: string }>();
  for (const piece of objects.flatMap((o) => tx.piecesOf(o))) {
    const type = tx.typeOf(piece);
    if (!isStackable(type)) throw new CommandError(`"${piece.id}" cannot be stacked.`);
    if (!kinds.has(type.id)) kinds.set(type.id, { type, piece: piece.id });
  }
  const list = [...kinds.values()];
  for (const [i, a] of list.entries()) {
    const b = list.slice(i + 1).find((other) => !stacksWith(a.type, other.type));
    if (b) throw new CommandError(`"${a.piece}" and "${b.piece}" cannot share a stack.`);
  }
}

/** A stack as it is, or a piece turned into a one-card stack where it lies. */
function asStack(tx: Transaction, object: TableObject): Stack {
  if (object.kind === 'stack') return object;
  const stack: Stack = {
    kind: 'stack',
    id: tx.newStackId(),
    pos: object.pos,
    rot: object.rot,
    z: object.z,
    items: [object.id],
  };
  if (object.snap) stack.snap = object.snap;
  tx.add(stack);
  tx.update(object, { parent: stack.id, snap: undefined });
  return stack;
}

/** What to draw, how many, and where they go. */
interface DrawOptions {
  from: string;
  count?: number;
  to: Target;
  face?: Face;
}

/**
 * Takes cards off the top of a stack to a target, or pieces at random out of a bag
 * (`owner/target`). Several land as a new stack.
 */
export function draw(tx: Transaction, options: DrawOptions): void {
  const { from, count = 1, to, face } = options;
  requireCount(count);
  if (from.includes('/')) {
    drawFromBag(tx, { ...options, count });
    return;
  }
  const source = tx.stackObject(from);
  if (count > source.items.length) {
    throw new CommandError(`"${from}" holds ${source.items.length} pieces; cannot draw ${count}.`);
  }
  // The top piece lands first, so the drawn pile keeps the stack's order reversed,
  // as when dealing cards one at a time onto a pile.
  const drawn = source.items.slice(source.items.length - count).reverse();
  const place = tx.place(
    to,
    drawn.map((id) => tx.stackItem(id)),
  );
  takeOff(tx, source, [{ ids: drawn, place }], face);
}

/** Draws pieces at random out of a bag. */
function drawFromBag(
  tx: Transaction,
  { from, count, to, face }: Required<Omit<DrawOptions, 'face'>> & { face?: Face },
): void {
  const [bag] = tx.spots(from, [], new Set());
  if (bag?.mode !== 'bag') throw new CommandError(`"${from}" is not a bag.`);
  const inside = tx.bagged(bag.ref);
  if (count > inside.length) {
    throw new CommandError(`"${bag.ref}" holds ${inside.length} pieces; cannot draw ${count}.`);
  }
  const drawn = tx
    .random((rng) => shuffled(inside, rng))
    .slice(0, count)
    .map((piece) => tx.update(piece, { bag: undefined }));
  land(tx, 0, [{ ids: drawn.map((p) => p.id), place: tx.place(to, drawn) }], face);
}

/**
 * Deals cards from the top of a stack, one at a time to each target in turn, for
 * `count` rounds. Cards dealt to the same place form a pile.
 */
export function deal(
  tx: Transaction,
  {
    from,
    to,
    count = 1,
    face,
  }: { from: string; to: Target | Target[]; count?: number; face?: Face },
): void {
  requireCount(count);
  const source = tx.stackObject(from);
  const targets = targetList(to);
  if (targets.length === 0) throw new CommandError('Give at least one place to deal to.');
  const cards = tx.piecesOf(source);
  const places = targets.flatMap((t) => tx.places(t, cards));
  const total = count * places.length;
  if (total > source.items.length) {
    throw new CommandError(
      `"${from}" holds ${source.items.length} cards; dealing ${count} to ${places.length} ` +
        `${places.length === 1 ? 'place' : 'places'} needs ${total}.`,
    );
  }
  // Cards come off the top (the end of `items`) and land bottom first on each pile.
  const order = source.items.slice(source.items.length - total).reverse();
  const piles: string[][] = places.map(() => []);
  order.forEach((id, i) => piles[i % places.length]!.push(id));
  takeOff(
    tx,
    source,
    piles.map((ids, i) => ({ ids, place: places[i]! })),
    face,
  );
}

/** Takes one particular piece out of a stack, wherever it is in the pile. */
export function take(tx: Transaction, id: string, to: Target, face?: Face): void {
  const piece = tx.get(id);
  if (piece.kind !== 'piece') throw new CommandError(`"${id}" is a stack; use draw or move.`);
  if (!piece.parent) throw new CommandError(`"${id}" is not in a stack; use move.`);
  const source = tx.stackObject(piece.parent);
  const place = tx.place(to, [piece]);
  takeOff(tx, source, [{ ids: [id], place }], face);
}

export function layout(tx: Transaction, id: string, layout: StackLayout): void {
  if (!['pile', 'fan', 'spread'].includes(layout))
    throw new CommandError('"layout" must be pile, fan or spread.');
  const stack = tx.stackObject(id);
  tx.update(stack, { layout: layout === 'pile' ? undefined : layout });
}

export function shuffle(tx: Transaction, id: string): void {
  const stack = tx.stackObject(id);
  const items = tx.random((rng) => shuffled(stack.items, rng));
  tx.update(stack, { items });
}

function requireCount(count: number): void {
  if (!Number.isInteger(count) || count < 1)
    throw new CommandError('"count" must be a whole number of at least 1.');
}

/** Pieces taken off a stack together, and where they land. */
interface Pile {
  ids: string[];
  place: Place;
}

/** Takes piles of pieces off a stack and puts them at their places. */
function takeOff(tx: Transaction, source: Stack, piles: Pile[], face?: Face): void {
  land(tx, source.rot, piles, face);
  const gone = new Set(piles.flatMap((p) => p.ids));
  setStackItems(
    tx,
    source,
    source.items.filter((id) => !gone.has(id)),
  );
}

/** Puts piles at their places, turned to `rot` unless the place says otherwise. */
function land(tx: Transaction, rot: number, piles: Pile[], face?: Face): void {
  for (const { ids, place } of piles) {
    if (place.hand === undefined) {
      layDown(tx, ids, { ...place, rot: place.rot ?? rot }, face);
    } else {
      const pieces = ids.map((id) => tx.update(tx.stackItem(id), { parent: undefined }));
      tx.toHand(pieces, place.hand);
    }
  }
}

/** Lays a pile on the table on top of everything; a pile of several becomes a stack. */
function layDown(
  tx: Transaction,
  ids: string[],
  place: Place & { rot: number },
  face?: Face,
): void {
  const { pos, rot, snap } = place;
  let z = tx.topZ();
  for (const id of ids) {
    const piece = tx.stackItem(id);
    tx.update(piece, {
      parent: undefined,
      pos,
      rot,
      z: z++,
      face: face ?? piece.face,
      snap: ids.length === 1 ? snap : undefined,
    });
  }
  if (ids.length > 1) {
    const stack: Stack = { kind: 'stack', id: tx.newStackId(), pos, rot, z, items: ids };
    if (snap) stack.snap = snap;
    tx.add(stack);
    for (const id of ids) tx.update(tx.stackItem(id), { parent: stack.id, z: 0 });
  }
}

/** Updates a stack's items, dissolving it when one or no pieces remain. */
function setStackItems(tx: Transaction, stack: Stack, items: string[]): void {
  if (items.length > 1) {
    tx.update(stack, { items });
    return;
  }
  tx.remove(stack.id);
  const last = items[0];
  if (last) {
    tx.update(tx.stackItem(last), {
      parent: undefined,
      pos: stack.pos,
      rot: stack.rot,
      z: stack.z,
      snap: stack.snap,
    });
  }
}

/** `to` as a list of places: one place, a list of them, or none when `to` is neither. */
function targetList(to: Target | Target[]): Target[] {
  if (typeof to === 'string' || isVec2(to)) return [to];
  return Array.isArray(to) ? to : [];
}
