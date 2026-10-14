import {
  FORMAT_VERSION,
  TableFile,
  flattenIssues,
  formatPath,
  type ComponentType,
  type PieceObject,
  type StackObject,
  type Vec2,
} from '@trayful/formats/browser';

export type Piece = PieceObject;
export type Stack = StackObject;
export type TableObject = Piece | Stack;

/** The in-memory table: the saved file's data, with objects keyed by id. */
export interface TableState {
  format: typeof FORMAT_VERSION;
  table: string;
  seed: number;
  rng: number;
  objects: Readonly<Record<string, TableObject>>;
}

/** Whether an object lies directly on the table: not inside a stack, and not in a player's hand. */
export function onTable(object: TableObject): boolean {
  return !(object.kind === 'piece' && (object.parent || object.hand));
}

/** The pieces in a player's hand, in the order they were picked up. */
export function handOf(state: TableState, player: string): Piece[] {
  return Object.values(state.objects)
    .filter((o): o is Piece => o.kind === 'piece' && o.hand === player)
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

/** How many pieces each player holds in their hand. */
export function handCounts(state: TableState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const object of Object.values(state.objects)) {
    if (object.kind === 'piece' && object.hand)
      counts[object.hand] = (counts[object.hand] ?? 0) + 1;
  }
  return counts;
}

/** `hand:<player>` names a player's private hand as a target. */
export const HAND_PREFIX = 'hand:';

export function handTarget(target: unknown): string | undefined {
  return typeof target === 'string' && target.startsWith(HAND_PREFIX)
    ? target.slice(HAND_PREFIX.length)
    : undefined;
}

/** What the engine needs to know about component types. */
export type Catalog = Readonly<Record<string, ComponentType>>;

/** `[width, height]` of a type in millimetres. */
export function sizeOf(type: Pick<ComponentType, 'size'>): Vec2 {
  return typeof type.size === 'number' ? [type.size, type.size] : type.size;
}

// ---------------------------------------------------------------------------
// Saving and loading
// ---------------------------------------------------------------------------

/** Converts a table to its file form, with objects sorted by id for clean diffs. */
export function toTableFile(state: TableState): TableFile {
  return {
    format: state.format,
    table: state.table,
    seed: state.seed,
    rng: state.rng,
    objects: Object.values(state.objects).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

export class TableFileError extends Error {}

/** Reads a table file's data, checking both its shape and that its references agree. */
export function fromTableFile(data: unknown): TableState {
  const result = TableFile.safeParse(data);
  if (!result.success) {
    const problems = flattenIssues(result.error.issues).map(
      (i) => `${formatPath(i.path) || '(root)'}: ${i.message}`,
    );
    throw new TableFileError(`Invalid table file:\n  ${problems.join('\n  ')}`);
  }
  const objects: Record<string, TableObject> = {};
  for (const object of result.data.objects) {
    if (objects[object.id]) throw new TableFileError(`Duplicate object id "${object.id}".`);
    objects[object.id] = object;
  }
  const state: TableState = { ...result.data, objects };
  const problems = checkIntegrity(state);
  if (problems.length > 0)
    throw new TableFileError(`Inconsistent table file:\n  ${problems.join('\n  ')}`);
  return state;
}

/** Problems with stack membership; an empty list means the table is consistent. */
export function checkIntegrity(state: TableState): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const object of Object.values(state.objects)) {
    if (object.kind === 'stack') {
      if (object.items.length === 0) problems.push(`Stack "${object.id}" is empty.`);
      for (const id of object.items) {
        const item = state.objects[id];
        if (!item || item.kind !== 'piece')
          problems.push(`Stack "${object.id}" lists unknown piece "${id}".`);
        else if (item.parent !== object.id)
          problems.push(
            `Piece "${id}" is in stack "${object.id}" but its parent is "${item.parent ?? 'none'}".`,
          );
        if (seen.has(id))
          problems.push(`Piece "${id}" is in both "${seen.get(id)}" and "${object.id}".`);
        seen.set(id, object.id);
      }
    } else if (object.parent && object.hand) {
      problems.push(`Piece "${object.id}" cannot be both in a stack and in a hand.`);
    } else if (object.parent) {
      const parent = state.objects[object.parent];
      if (!parent || parent.kind !== 'stack' || !parent.items.includes(object.id)) {
        problems.push(
          `Piece "${object.id}" names "${object.parent}" as its stack, but that stack does not hold it.`,
        );
      }
    }
  }
  return problems;
}
