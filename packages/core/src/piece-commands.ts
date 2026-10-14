import { PRIMITIVE_INFO } from '@trayful/formats/browser';
import { nextInt } from './rng.js';
import type { Piece } from './state.js';
import { CommandError, type Transaction } from './transaction.js';

/** Turns a piece over, or a whole stack, which also reverses its order. */
export function flip(tx: Transaction, id: string): void {
  const object = tx.topLevel(id);
  for (const piece of tx.piecesOf(object)) {
    requireTwoSided(tx, piece);
    tx.update(piece, { face: piece.face === 'up' ? 'down' : 'up' });
  }
  if (object.kind === 'stack') tx.update(object, { items: [...object.items].reverse() });
}

function requireTwoSided(tx: Transaction, piece: Piece): void {
  const type = tx.typeOf(piece);
  if (PRIMITIVE_INFO[type.base].sides !== 2) {
    throw new CommandError(`"${piece.id}" is a ${type.base} and has only one side.`);
  }
}

/** Rotates by whole steps of the type's `rotationStep`, or by free degrees. */
export function rotate(tx: Transaction, id: string, steps?: number, degrees?: number): void {
  if ((steps === undefined) === (degrees === undefined)) {
    throw new CommandError('Give exactly one of "steps" or "degrees".');
  }
  const object = tx.topLevel(id);
  // A stack turns by the step of its bottom piece.
  const step = tx.typeOf(tx.piecesOf(object)[0]!).rotationStep ?? 90;
  const delta = degrees ?? steps! * step;
  tx.onTable(id);
  tx.relocate(object, object.pos, object.rot + delta, object.snap);
}

export function roll(tx: Transaction, id: string): void {
  const piece = tx.piece(id);
  const type = tx.typeOf(piece);
  if (type.base !== 'die') throw new CommandError(`"${id}" is a ${type.base}, not a die.`);
  const faces = type.faces ?? [1, 2, 3, 4, 5, 6];
  const index = tx.random((rng) => nextInt(rng, faces.length));
  tx.update(piece, { value: faces[index]! });
}

/** Sets a counter's number, kept within its range, or a die's face. */
export function setValue(tx: Transaction, id: string, value: number | string): void {
  const piece = tx.piece(id);
  const type = tx.typeOf(piece);
  if (type.base === 'counter') {
    const [min, max] = type.range ?? [0, 99];
    if (typeof value !== 'number' || !Number.isInteger(value))
      throw new CommandError('A counter value must be a whole number.');
    tx.update(piece, { value: Math.min(max, Math.max(min, value)) });
  } else if (type.base === 'die') {
    const faces = type.faces ?? [1, 2, 3, 4, 5, 6];
    if (!faces.includes(value)) throw new CommandError(`"${value}" is not a face of "${id}".`);
    tx.update(piece, { value });
  } else {
    throw new CommandError(`"${id}" is a ${type.base}; only counters and dice have a value.`);
  }
}
