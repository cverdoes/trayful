import {
  HAND_PREFIX,
  type Activity,
  type Command,
  type Motion,
  type TableView,
} from '@trayful/core';

/** A few words on what a command did, for people watching. Never names a piece. */
export function activityText(
  command: Command,
  whose: (player: string) => string = () => 'a',
): string {
  const n = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;
  const into = (to: unknown) =>
    typeof to === 'string' && to.startsWith(HAND_PREFIX)
      ? ` into ${whose(to.slice(HAND_PREFIX.length))} hand`
      : '';
  switch (command.type) {
    case 'move':
      return `moved ${n(command.ids.length, 'piece')}${into(command.to)}`;
    case 'flip':
      return `flipped ${n(command.ids.length, 'piece')}`;
    case 'rotate':
      return `turned ${n(command.ids.length, 'piece')}`;
    case 'stack':
      return `stacked ${n(command.ids.length, 'piece')}`;
    case 'draw':
      return `drew ${n(command.count ?? 1, 'piece')}${command.from.includes('/') ? ' from a bag' : ''}${into(command.to)}`;
    case 'deal':
      return `dealt ${n(command.count ?? 1, 'piece')} each`;
    case 'take':
      return `took a piece from a pile${into(command.to)}`;
    case 'layout':
      return 'spread out a pile';
    case 'shuffle':
      return 'shuffled a pile';
    case 'roll':
      return 'rolled';
    case 'setValue':
      return 'set a value';
    case 'lock':
      return `${command.locked ? 'locked' : 'unlocked'} ${n(command.ids.length, 'piece')}`;
    default:
      return 'changed the table';
  }
}

/**
 * What people at the table should see move as these commands land: the dice they roll,
 * or else the piles they shuffle. One change does one or the other, so one kind will do.
 */
export function motionOf(commands: readonly Command[]): Motion | undefined {
  for (const kind of ['roll', 'shuffle'] as const) {
    const ids = commands.flatMap((c) =>
      (c.type === 'roll' || c.type === 'shuffle') && c.type === kind ? [c.id] : [],
    );
    if (ids.length > 0) return { kind, ids };
  }
  return undefined;
}

/** The activity as one viewer may see it: motion only for the pieces in their view. */
export function activityFor(activity: Activity, view: TableView): Activity {
  if (!activity.motion) return activity;
  const { motion, ...rest } = activity;
  const ids = motion.ids.filter((id) => view.objects[id]);
  return ids.length > 0 ? { ...rest, motion: { ...motion, ids } } : rest;
}
