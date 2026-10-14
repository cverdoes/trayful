import {
  byCodeUnit,
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
  return !(object.kind === 'piece' && (object.parent !== undefined || object.hand !== undefined));
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
    objects: Object.values(state.objects).sort((a, b) => byCodeUnit(a.id, b.id)),
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
  /** The stack each piece was first seen in, to catch pieces listed by two. */
  const seen = new Map<string, string>();
  for (const object of Object.values(state.objects)) {
    if (object.kind === 'stack') problems.push(...stackProblems(state, object, seen));
    else {
      const problem = pieceProblem(state, object);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

/** A stack must hold pieces that name it as their parent, and share none with another stack. */
function stackProblems(state: TableState, stack: Stack, seen: Map<string, string>): string[] {
  const problems: string[] = [];
  if (stack.items.length === 0) problems.push(`Stack "${stack.id}" is empty.`);
  for (const id of stack.items) {
    const item = state.objects[id];
    if (item?.kind !== 'piece') problems.push(`Stack "${stack.id}" lists unknown piece "${id}".`);
    else if (item.parent !== stack.id)
      problems.push(
        `Piece "${id}" is in stack "${stack.id}" but its parent is "${item.parent ?? 'none'}".`,
      );
    if (seen.has(id))
      problems.push(`Piece "${id}" is in both "${seen.get(id)}" and "${stack.id}".`);
    seen.set(id, stack.id);
  }
  return problems;
}

/** A piece's stack must list it, and a piece cannot be in a stack and a hand at once. */
function pieceProblem(state: TableState, piece: Piece): string | undefined {
  if (!piece.parent) return undefined;
  if (piece.hand) return `Piece "${piece.id}" cannot be both in a stack and in a hand.`;
  const parent = state.objects[piece.parent];
  if (parent?.kind === 'stack' && parent.items.includes(piece.id)) return undefined;
  return `Piece "${piece.id}" names "${piece.parent}" as its stack, but that stack does not hold it.`;
}

/**
 * Takes an object off a table, in place. `no-dynamic-delete` asks for a `Map` instead of
 * deleting keys from a plain object, but that doesn't suit tables: they keep their objects
 * in a plain record keyed by id because the record is saved and sent as JSON. So removals
 * go through this one function rather than a `delete` scattered across core.
 */
export function removeObject(objects: Record<string, TableObject>, id: string): void {
  Reflect.deleteProperty(objects, id);
}

/**
 * `object` with `changes` applied, where a change to `undefined` removes that key. Any key
 * already `undefined` on `object` is left out too; a saved table has none.
 */
export function withChanges<T extends object>(object: T, changes: Partial<T>): T {
  const merged = Object.entries({ ...object, ...changes }).filter(([, v]) => v !== undefined);
  return Object.fromEntries(merged) as T;
}
