import {
  rotationStep,
  sidesOf,
  valueAt,
  valueCount,
  valueIndex,
  valuesOf,
  type ComponentType,
} from '@trayful/formats/browser';
import { nextInt } from './rng.js';
import type { Piece, TableObject } from './state.js';
import { CommandError, type Transaction } from './transaction.js';

/** Turns a piece over, or a whole stack, which also reverses its order. */
export function flip(tx: Transaction, id: string): void {
  const object = unlocked(tx.topLevel(id), 'flipped');
  for (const piece of tx.piecesOf(object)) {
    requireTwoSided(tx, piece);
    tx.update(piece, { face: piece.face === 'up' ? 'down' : 'up' });
  }
  if (object.kind === 'stack') tx.update(object, { items: [...object.items].reverse() });
}

/** A locked object stays as it is: it cannot be moved, turned or flipped. */
function unlocked<T extends TableObject>(object: T, verb: string): T {
  if (object.locked) throw new CommandError(`"${object.id}" is locked, so it cannot be ${verb}.`);
  return object;
}

function requireTwoSided(tx: Transaction, piece: Piece): void {
  if (sidesOf(tx.typeOf(piece)) !== 2) {
    throw new CommandError(`"${piece.id}" has only one side.`);
  }
}

/** Rotates by whole steps of the component's rotation step, or by free degrees. */
export function rotate(tx: Transaction, id: string, steps?: number, degrees?: number): void {
  if ((steps === undefined) === (degrees === undefined)) {
    throw new CommandError('Give exactly one of "steps" or "degrees".');
  }
  const object = unlocked(tx.topLevel(id), 'turned');
  // A stack turns by the step of its bottom piece.
  const step = rotationStep(tx.typeOf(tx.piecesOf(object)[0]!));
  if (step === undefined) throw new CommandError(`"${id}" does not rotate.`);
  const delta = degrees ?? steps! * step;
  tx.onTable(id);
  tx.relocate(object, object.pos, object.rot + delta, object.snap);
}

/** Rolls a die, or any counter that can be rolled, to a random one of its values. */
export function roll(tx: Transaction, id: string): void {
  const piece = tx.piece(id);
  const spec = valuesOf(tx.typeOf(piece));
  if (!spec?.controls.includes('roll')) throw new CommandError(`"${id}" cannot be rolled.`);
  const index = tx.random((rng) => nextInt(rng, valueCount(spec)));
  tx.update(piece, { value: valueAt(spec, index) });
}

/** Sets a die's or counter's value: a number in a range is kept within it, a listed value must be one. */
export function setValue(tx: Transaction, id: string, value: number | string): void {
  const piece = tx.piece(id);
  const type = tx.typeOf(piece);
  const spec = valuesOf(type);
  if (!spec) throw new CommandError(`"${id}" has no value; only dice and counters do.`);
  checkValue(type, spec, value);
  // A number beyond a range stops at its end, as a counter's dial would.
  const [min, max] = spec.range ?? [-Infinity, Infinity];
  tx.update(piece, {
    value: typeof value === 'number' ? Math.min(max, Math.max(min, value)) : value,
  });
}

/** Refuses a value a die or counter cannot show: not a whole number in a range, or not in a list. */
function checkValue(
  type: ComponentType,
  spec: NonNullable<ReturnType<typeof valuesOf>>,
  value: number | string,
): void {
  if (spec.range) {
    if (typeof value !== 'number' || !Number.isInteger(value))
      throw new CommandError(`A value of "${type.id}" must be a whole number.`);
    return;
  }
  if (valueIndex(spec, value) < 0)
    throw new CommandError(`"${value}" is not one of the values of "${type.id}".`);
}
