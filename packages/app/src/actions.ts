import type { Command, TableObject } from '@trayful/core';
import { baseOf, objectSize } from './render/geometry';
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

const LAYOUT_LABEL = { pile: 'Pile', fan: 'Fan', spread: 'Spread' } as const;

/** Works out which actions apply to the selected objects. Each action sends one command per kind of object. */
export function selectionActions(): Actions {
  const { table, view, selection, command } = useStore.getState();
  const none: Actions = { lockLabel: 'Lock', layoutLabel: 'Fan' };
  if (!table || !view || selection.length === 0) return none;
  const objects = selection
    .map((id) => table.objects[id])
    .filter((o): o is TableObject => o !== undefined);
  if (objects.length === 0) return none;
  const base = (o: TableObject) => baseOf(table, view.types, o);
  const ids = objects.map((o) => o.id);
  const unlocked = objects.filter((o) => !o.locked).map((o) => o.id);
  const flippable = objects.filter(
    (o) => ['card', 'tile', 'token'].includes(base(o) ?? '') && !o.locked,
  );
  const stacks = objects.filter((o) => o.kind === 'stack' && !o.locked);
  const dice = objects.filter((o) => o.kind === 'piece' && base(o) === 'die');
  const counters = objects.filter((o) => o.kind === 'piece' && base(o) === 'counter');
  const allLocked = objects.every((o) => o.locked);
  const current = stacks[0]?.kind === 'stack' ? (stacks[0].layout ?? 'pile') : 'pile';
  const next = ({ pile: 'fan', fan: 'spread', spread: 'pile' } as const)[current];

  const each = (list: TableObject[], make: (o: TableObject) => Command) => () => {
    for (const o of list) command(make(o));
  };
  const step = (by: number) =>
    each(counters, (o) => ({
      type: 'setValue',
      id: o.id,
      value: (o.kind === 'piece' && typeof o.value === 'number' ? o.value : 0) + by,
    }));

  return {
    flip: flippable.length
      ? () => command({ type: 'flip', ids: flippable.map((o) => o.id) })
      : undefined,
    rotateLeft: unlocked.length
      ? () => command({ type: 'rotate', ids: unlocked, steps: -1 })
      : undefined,
    rotateRight: unlocked.length
      ? () => command({ type: 'rotate', ids: unlocked, steps: 1 })
      : undefined,
    shuffle: stacks.length ? each(stacks, (o) => ({ type: 'shuffle', id: o.id })) : undefined,
    roll: dice.length ? each(dice, (o) => ({ type: 'roll', id: o.id })) : undefined,
    draw:
      stacks.length === 1
        ? () => {
            // Deal the top card just to the right of the pile.
            const stack = stacks[0]!;
            const [w] = objectSize(table, view.types, stack);
            command({ type: 'draw', from: stack.id, to: [stack.pos[0] + w + 4, stack.pos[1]] });
          }
        : undefined,
    layout: stacks.length
      ? each(stacks, (o) => ({ type: 'layout', id: o.id, layout: next }))
      : undefined,
    layoutLabel: LAYOUT_LABEL[next],
    lock: () => command({ type: 'lock', ids, locked: !allLocked }),
    increment: counters.length ? step(1) : undefined,
    decrement: counters.length ? step(-1) : undefined,
    lockLabel: allLocked ? 'Unlock' : 'Lock',
  };
}
