import {
  FORMAT_VERSION,
  PRIMITIVE_INFO,
  TableFile,
  flattenIssues,
  formatPath,
  type ComponentType,
  type PieceObject,
  type ResolvedProject,
  type StackObject,
  type Vec2,
} from '@trayful/formats';
import { seedState } from './rng.js';

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

/** What the engine needs to know about component types. */
export type Catalog = Readonly<Record<string, ComponentType>>;

export interface CreateTableOptions {
  name: string;
  seed?: number;
}

const BOX_WIDTH = 1200;
const GAP = 10;

/**
 * Creates a table with every component from the inventory "out of the box":
 * decks as face-down stacks, everything else laid out in rows. Setups
 * (scripted layouts) arrive in a later milestone.
 */
export function createTable(project: ResolvedProject, options: CreateTableOptions): TableState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const objects: Record<string, TableObject> = {};
  let z = 0;
  let cursor: Vec2 = [0, 0];
  let rowHeight = 0;

  const place = (size: Vec2): Vec2 => {
    if (cursor[0] > 0 && cursor[0] + size[0] > BOX_WIDTH) {
      cursor = [0, cursor[1] + rowHeight + GAP];
      rowHeight = 0;
    }
    const centre: Vec2 = [cursor[0] + size[0] / 2, cursor[1] + size[1] / 2];
    cursor = [cursor[0] + size[0] + GAP, cursor[1]];
    rowHeight = Math.max(rowHeight, size[1]);
    return centre;
  };

  const placedDecks = new Set<string>();
  for (const spec of project.components) {
    const type = project.types[spec.type]!;
    const size = sizeOf(type);
    if (spec.deck) {
      if (placedDecks.has(spec.deck)) continue;
      placedDecks.add(spec.deck);
      // Decks list their top card first; stacks store bottom to top.
      const ids = [...project.decks[spec.deck]!].reverse();
      const stackId = `deck:${spec.deck}`;
      for (const id of ids) {
        const member = project.components.find((c) => c.id === id)!;
        objects[id] = newPiece(
          member.id,
          project.types[member.type]!,
          member.data,
          [0, 0],
          0,
          'down',
          stackId,
        );
      }
      objects[stackId] = {
        kind: 'stack',
        id: stackId,
        name: spec.deck,
        pos: place(size),
        rot: 0,
        z: z++,
        items: ids,
      };
      continue;
    }
    objects[spec.id] = newPiece(spec.id, type, spec.data, place(size), z++, 'up');
  }

  return { format: FORMAT_VERSION, table: options.name, seed, rng: seedState(seed), objects };
}

function newPiece(
  id: string,
  type: ComponentType,
  data: Record<string, string | number | boolean>,
  pos: Vec2,
  z: number,
  face: 'up' | 'down',
  parent?: string,
): Piece {
  const piece: Piece = { kind: 'piece', id, type: type.id, data, pos, rot: 0, face, z };
  if (Object.keys(data).length === 0) delete piece.data;
  if (parent) piece.parent = parent;
  if (type.base === 'board') piece.locked = true;
  if (type.base === 'counter') piece.value = type.range?.[0] ?? 0;
  if (type.base === 'die') piece.value = type.faces?.[0] ?? 1;
  if (PRIMITIVE_INFO[type.base].sides === 1) piece.face = 'up';
  return piece;
}

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
