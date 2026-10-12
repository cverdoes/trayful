import { PRIMITIVE_INFO, type Vec2 } from '@trayful/formats/browser';
import { nextInt, shuffled } from './rng.js';
import type { Catalog, Piece, Stack, TableObject, TableState } from './state.js';

/**
 * Every change to a table is one of these commands. The UI and the MCP server
 * both send commands, so they share validation, undo and the history log.
 */
export type Command =
  /** Move objects by an offset, or move the first to `to` and keep the others' relative positions. */
  | { type: 'move'; ids: string[]; by?: Vec2; to?: Vec2 }
  /** Turn objects over. Flipping a stack turns the whole pile over, reversing its order. */
  | { type: 'flip'; ids: string[] }
  /** Rotate by whole steps of the type's `rotationStep` (default 90°), or by free degrees. */
  | { type: 'rotate'; ids: string[]; steps?: number; degrees?: number }
  /** Put objects on top of a piece or stack, in the order given (last ends on top). */
  | { type: 'stack'; ids: string[]; onto: string }
  /** Take cards off the top of a stack to a position. Several cards land as a new stack. */
  | { type: 'draw'; from: string; count?: number; to: Vec2; face?: 'up' | 'down' }
  /**
   * Deal cards from the top of a stack, one at a time to each position in turn, for
   * `count` rounds. Cards dealt to the same position form a pile.
   */
  | { type: 'deal'; from: string; to: Vec2[]; count?: number; face?: 'up' | 'down' }
  | { type: 'shuffle'; id: string }
  | { type: 'roll'; id: string }
  /** Set a counter's number or a die's face. */
  | { type: 'setValue'; id: string; value: number | string }
  | { type: 'lock'; ids: string[]; locked: boolean };

export type CommandType = Command['type'];

export class CommandError extends Error {}

/** Applies a command and returns the new state. The input state is never modified. */
export function applyCommand(state: TableState, command: Command, catalog: Catalog): TableState {
  const tx = new Transaction(state, catalog);
  switch (command.type) {
    case 'move':
      tx.move(command.ids, command.by, command.to);
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
    return { ...this.state, rng: this.rng, objects: this.objects };
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

  move(ids: string[], by?: Vec2, to?: Vec2): void {
    if ((by === undefined) === (to === undefined))
      throw new CommandError('Give exactly one of "by" or "to".');
    const objects = unique(ids).map((id) => this.topLevel(id));
    for (const object of objects) {
      if (object.locked) throw new CommandError(`"${object.id}" is locked.`);
    }
    const offset: Vec2 = by ?? [to![0] - objects[0]!.pos[0], to![1] - objects[0]!.pos[1]];
    let z = this.topZ();
    for (const object of [...objects].sort((a, b) => a.z - b.z)) {
      this.update(object, {
        pos: [object.pos[0] + offset[0], object.pos[1] + offset[1]],
        z: z++,
        snap: undefined,
      });
    }
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
    this.update(object, { rot: (((object.rot + delta) % 360) + 360) % 360 });
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

  draw(fromId: string, count: number, to: Vec2, face?: 'up' | 'down'): void {
    if (!Number.isInteger(count) || count < 1)
      throw new CommandError('"count" must be a whole number of at least 1.');
    const stack = this.stackObject(fromId);
    if (count > stack.items.length) {
      throw new CommandError(
        `"${fromId}" holds ${stack.items.length} pieces; cannot draw ${count}.`,
      );
    }
    const remaining = stack.items.slice(0, stack.items.length - count);
    // The top piece lands first, so the drawn pile keeps the stack's order reversed,
    // as when dealing cards one at a time onto a pile.
    const drawn = stack.items.slice(stack.items.length - count).reverse();
    let z = this.topZ();
    for (const pieceId of drawn) {
      const piece = this.get(pieceId) as Piece;
      this.update(piece, {
        parent: undefined,
        pos: to,
        rot: stack.rot,
        z: z++,
        face: face ?? piece.face,
      });
    }
    if (count > 1) {
      const stackId = this.newStackId();
      this.objects[stackId] = {
        kind: 'stack',
        id: stackId,
        pos: to,
        rot: stack.rot,
        z,
        items: drawn,
      };
      for (const pieceId of drawn)
        this.update(this.get(pieceId) as Piece, { parent: stackId, z: 0 });
    }
    this.setStackItems(stack, remaining);
  }

  deal(fromId: string, spots: Vec2[], rounds: number, face?: 'up' | 'down'): void {
    if (!Array.isArray(spots) || spots.length === 0)
      throw new CommandError('Give at least one position to deal to.');
    if (!Number.isInteger(rounds) || rounds < 1)
      throw new CommandError('"count" must be a whole number of at least 1.');
    const stack = this.stackObject(fromId);
    const total = rounds * spots.length;
    if (total > stack.items.length) {
      throw new CommandError(
        `"${fromId}" holds ${stack.items.length} cards; dealing ${rounds} to ${spots.length} ` +
          `${spots.length === 1 ? 'position' : 'positions'} needs ${total}.`,
      );
    }
    // Cards come off the top (the end of `items`) and land bottom first on each pile.
    const order = stack.items.slice(stack.items.length - total).reverse();
    const piles: string[][] = spots.map(() => []);
    order.forEach((id, i) => piles[i % spots.length]!.push(id));
    let z = this.topZ();
    piles.forEach((pile, i) => {
      const pos = spots[i]!;
      for (const pieceId of pile) {
        const piece = this.get(pieceId) as Piece;
        this.update(piece, {
          parent: undefined,
          pos,
          rot: stack.rot,
          z: z++,
          face: face ?? piece.face,
        });
      }
      if (pile.length > 1) {
        const stackId = this.newStackId();
        this.objects[stackId] = {
          kind: 'stack',
          id: stackId,
          pos,
          rot: stack.rot,
          z: z++,
          items: pile,
        };
        for (const pieceId of pile)
          this.update(this.get(pieceId) as Piece, { parent: stackId, z: 0 });
      }
    });
    this.setStackItems(stack, stack.items.slice(0, stack.items.length - total));
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
