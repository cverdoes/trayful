import type { Command, TableObject, TableState } from '@trayful/core';
import {
  rotationStep,
  sidesOf,
  stepValue,
  valuesOf,
  type ComponentType,
  type Control,
} from '@trayful/formats/browser';
import { objectSize, typeOf, type Types } from './render/geometry';
import { useStore } from './store';

/** What the toolbar and keyboard can do with the current selection. */
export interface Actions {
  flip?: () => void;
  rotateLeft?: () => void;
  rotateRight?: () => void;
  shuffle?: () => void;
  roll?: () => void;
  draw?: () => void;
  /** Cycles the selected stacks through pile, fan and spread. */
  layout?: () => void;
  layoutLabel: 'Fan' | 'Spread' | 'Pile';
  lock?: () => void;
  increment?: () => void;
  decrement?: () => void;
  lockLabel: 'Lock' | 'Unlock';
}

const NO_ACTIONS: Actions = { lockLabel: 'Lock', layoutLabel: 'Fan' };
const NEXT_LAYOUT = { pile: 'fan', fan: 'spread', spread: 'pile' } as const;
const LAYOUT_LABEL = { pile: 'Pile', fan: 'Fan', spread: 'Spread' } as const;

/** Works out which actions apply to the selected objects. */
export function selectionActions(): Actions {
  const { table, view, selection, command } = useStore.getState();
  if (!table || !view) return NO_ACTIONS;
  return actionsFor(table, view.types, selection, command);
}

/** The actions for some objects on a table. Each action sends one command per kind of object. */
export function actionsFor(
  table: TableState,
  types: Types,
  selection: string[],
  command: (command: Command) => void,
): Actions {
  const objects = selection
    .map((id) => table.objects[id])
    .filter((o): o is TableObject => o !== undefined);
  if (objects.length === 0) return NO_ACTIONS;
  const has = (test: (type: ComponentType) => boolean) => (o: TableObject) => {
    const type = typeOf(table, types, o);
    return type !== undefined && test(type);
  };
  const unlocked = objects.filter((o) => !o.locked);
  const stacks = unlocked.filter((o) => o.kind === 'stack');
  const turning = unlocked.filter(has((t) => rotationStep(t) !== undefined));
  const counters = objects.filter((o) => o.kind === 'piece' && has(controls('step'))(o));
  const allLocked = unlocked.length === 0;
  const next = NEXT_LAYOUT[stacks[0]?.kind === 'stack' ? (stacks[0].layout ?? 'pile') : 'pile'];

  /** An action that sends the commands `make` gives, or none when there is nothing to act on. */
  const when = (list: TableObject[], make: (list: TableObject[]) => Command[]) =>
    list.length ? () => make(list).forEach(command) : undefined;
  const ids = (list: TableObject[]) => list.map((o) => o.id);
  const step = (by: number) => (list: TableObject[]) =>
    list.map((o): Command => ({ type: 'setValue', id: o.id, value: stepped(types, o, by) }));

  return {
    flip: when(unlocked.filter(has((t) => sidesOf(t) === 2)), (list) => [
      { type: 'flip', ids: ids(list) },
    ]),
    rotateLeft: when(turning, (list) => [{ type: 'rotate', ids: ids(list), steps: -1 }]),
    rotateRight: when(turning, (list) => [{ type: 'rotate', ids: ids(list), steps: 1 }]),
    shuffle: when(stacks, (list) => list.map((o) => ({ type: 'shuffle', id: o.id }))),
    roll: when(
      objects.filter((o) => o.kind === 'piece' && has(controls('roll'))(o)),
      (list) => list.map((o) => ({ type: 'roll', id: o.id })),
    ),
    draw: when(stacks.length === 1 ? stacks : [], ([stack]) => [drawBeside(table, types, stack!)]),
    layout: when(stacks, (list) => list.map((o) => ({ type: 'layout', id: o.id, layout: next }))),
    layoutLabel: LAYOUT_LABEL[next],
    lock: () => command({ type: 'lock', ids: ids(objects), locked: !allLocked }),
    increment: when(counters, step(1)),
    decrement: when(counters, step(-1)),
    lockLabel: allLocked ? 'Unlock' : 'Lock',
  };
}

/** Deals the top card of a pile just to the right of it. */
function drawBeside(table: TableState, types: Types, stack: TableObject): Command {
  const [w] = objectSize(table, types, stack);
  return { type: 'draw', from: stack.id, to: [stack.pos[0] + w + 4, stack.pos[1]] };
}

/** Whether a die or counter has a control. */
const controls = (control: Control) => (type: ComponentType) =>
  valuesOf(type)?.controls.includes(control) ?? false;

/** A counter's value stepped up or down, within its values. */
function stepped(types: Types, object: TableObject, by: number): string | number {
  const piece = object.kind === 'piece' ? object : undefined;
  const spec = piece && types[piece.type] && valuesOf(types[piece.type]!);
  return spec ? stepValue(spec, piece.value, by) : 0;
}
