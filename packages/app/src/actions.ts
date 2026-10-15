import type { Command, TableObject, TableState } from '@trayful/core';
import { baseOf, objectSize, type Types } from './render/geometry';
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
const FLIPPABLE = new Set(['card', 'tile', 'token']);

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
  const base = (o: TableObject) => baseOf(table, types, o);
  const unlocked = objects.filter((o) => !o.locked);
  const stacks = unlocked.filter((o) => o.kind === 'stack');
  const counters = objects.filter((o) => o.kind === 'piece' && base(o) === 'counter');
  const allLocked = unlocked.length === 0;
  const next = NEXT_LAYOUT[stacks[0]?.kind === 'stack' ? (stacks[0].layout ?? 'pile') : 'pile'];

  /** An action that sends the commands `make` gives, or none when there is nothing to act on. */
  const when = (list: TableObject[], make: (list: TableObject[]) => Command[]) =>
    list.length ? () => make(list).forEach(command) : undefined;
  const ids = (list: TableObject[]) => list.map((o) => o.id);
  const step = (by: number) => (list: TableObject[]) =>
    list.map((o): Command => ({ type: 'setValue', id: o.id, value: valueOf(o) + by }));

  return {
    flip: when(
      unlocked.filter((o) => FLIPPABLE.has(base(o) ?? '')),
      (list) => [{ type: 'flip', ids: ids(list) }],
    ),
    rotateLeft: when(unlocked, (list) => [{ type: 'rotate', ids: ids(list), steps: -1 }]),
    rotateRight: when(unlocked, (list) => [{ type: 'rotate', ids: ids(list), steps: 1 }]),
    shuffle: when(stacks, (list) => list.map((o) => ({ type: 'shuffle', id: o.id }))),
    roll: when(
      objects.filter((o) => o.kind === 'piece' && base(o) === 'die'),
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

function valueOf(object: TableObject): number {
  return object.kind === 'piece' && typeof object.value === 'number' ? object.value : 0;
}
