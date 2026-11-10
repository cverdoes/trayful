import {
  HAND_PREFIX,
  isHidden,
  surfaceTarget,
  onTable,
  type TableObject,
  type TableState,
  type Activity,
  type Aliases,
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
  const into = (to: unknown) => {
    if (typeof to !== 'string') return '';
    if (to.startsWith(HAND_PREFIX)) return ` into ${whose(to.slice(HAND_PREFIX.length))} hand`;
    const surface = surfaceTarget(to);
    return surface === undefined ? '' : ` to ${surface}`;
  };
  switch (command.type) {
    case 'move':
      return `moved ${n(command.ids.length, 'piece')}${into(command.to)}${command.surface ? ` to ${command.surface}` : ''}`;
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
    case 'mark':
      return command.text === undefined ? 'stamped a box' : 'wrote in a box';
    case 'erase':
      return 'erased a box';
    case 'addSurface':
      return `added surface ${command.id}`;
    case 'editSurface':
      return `changed surface ${command.id}`;
    case 'removeSurface':
      return `removed surface ${command.id}`;
    case 'sit':
      return sitText(command, whose);
    default:
      return 'changed the table';
  }
}

/** Who sat down or stood up where. `whose` says `their` for the player who acted. */
function sitText(
  { surface, player }: { surface: string; player?: string },
  whose: (player: string) => string,
): string {
  if (player === undefined) return `stood someone up from ${surface}`;
  const name = whose(player);
  if (name === 'their') return `sat down at ${surface}`;
  return `seated ${name === 'a' ? 'a player' : name.replace(/'s$/, '')} at ${surface}`;
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

/**
 * The activity as one viewer may see it: motion only for the pieces in their view, and
 * where pieces came from only for those they see now, by the names they know them by.
 */
export function activityFor(
  activity: Activity,
  view: TableView,
  name: (id: string) => string = (id) => id,
): Activity {
  const { motion, from, ...rest } = activity;
  const ids = motion?.ids.filter((id) => view.objects[id]) ?? [];
  const seen = Object.entries(from ?? {}).flatMap(([id, stack]) => {
    const known = name(id);
    return view.objects[known] ? [[known, stack] as const] : [];
  });
  return {
    ...rest,
    ...(motion && ids.length > 0 ? { motion: { ...motion, ids } } : {}),
    ...(seen.length > 0 ? { from: Object.fromEntries(seen) } : {}),
  };
}

/** The name `viewer` knows a piece by: its stand-in when it is hidden from them. */
export function namedFor(
  state: TableState,
  id: string,
  viewer: string | undefined,
  aliases: Aliases,
): string {
  const piece = state.objects[id];
  return piece?.kind === 'piece' && isHidden(piece, viewer) ? aliases.alias(id) : id;
}

/** More pieces than this coming out of stacks at once, such as a new table, go unexplained. */
const MAX_ORIGINS = 40;

/** The stacks pieces left in a change, by piece id: where a drawn or dealt card came from. */
export function originsOf(before: TableState, after: TableState): Record<string, string> {
  const from: Record<string, string> = {};
  for (const object of Object.values(after.objects)) {
    const was = before.objects[object.id];
    if (object.kind !== 'piece' || was?.kind !== 'piece' || !was.parent) continue;
    if (was.parent !== object.parent) from[object.id] = was.parent;
  }
  return Object.keys(from).length > MAX_ORIGINS ? {} : from;
}

/**
 * The pieces and stacks on the table that a change touched, as a spectator sees them:
 * nothing in a hand or a bag, and no face-down piece, so the list gives nothing away.
 */
export function changedInSight(before: TableState, after: TableState): string[] {
  const inSight = (o: TableObject | undefined) =>
    o !== undefined && onTable(o) && !(o.kind === 'piece' && isHidden(o, undefined));
  const ids = new Set([...Object.keys(before.objects), ...Object.keys(after.objects)]);
  return [...ids].filter((id) => {
    const [was, is] = [before.objects[id], after.objects[id]];
    return was !== is && (inSight(was) || inSight(is));
  });
}
