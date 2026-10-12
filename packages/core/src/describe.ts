import type { Vec2 } from '@trayful/formats/browser';
import { sizeOf, type Catalog, type Piece, type TableObject, type TableState } from './state.js';

/**
 * Readable views of a table for agents. Face-down cards keep their secrets:
 * their data, and the order of cards in a pile, only show with `reveal`.
 */

export interface PieceSummary {
  id: string;
  type: string;
  base: string;
  face?: 'up' | 'down';
  /** The component's fields; left out while it lies face down, unless revealed. */
  data?: Record<string, unknown>;
  value?: number | string;
}

export interface ObjectSummary {
  id: string;
  kind: 'piece' | 'stack';
  /** Centre, in millimetres. */
  pos: Vec2;
  rot: number;
  size: Vec2;
  locked?: boolean;
  /** For a piece: the piece itself. For a stack: its top piece. */
  top: PieceSummary;
  /** Stacks only: how many pieces it holds. */
  count?: number;
  /** Stacks only, when revealed: the pieces from bottom to top. */
  items?: PieceSummary[];
  /** Pieces inside a stack: the stack's id. */
  parent?: string;
}

export interface ObjectQuery {
  /** Only objects whose (top) piece has this component type. */
  type?: string;
  /** Only objects whose (top) piece has this primitive, such as `card` or `die`. */
  base?: string;
  /** Only objects whose visible data matches all these fields. */
  where?: Record<string, string | number | boolean>;
  /** Only objects whose centre lies in this rectangle: `[x, y, width, height]` in mm. */
  region?: [number, number, number, number];
  /** List the pieces inside this stack instead of the objects on the table. */
  inside?: string;
  /** Show face-down data and the order of cards in piles. */
  reveal?: boolean;
}

export function summarizePiece(piece: Piece, catalog: Catalog, reveal = false): PieceSummary {
  const type = catalog[piece.type];
  const hidden = piece.face === 'down' && !reveal;
  return {
    id: piece.id,
    type: piece.type,
    base: type?.base ?? 'unknown',
    ...(piece.face ? { face: piece.face } : {}),
    ...(piece.data && !hidden ? { data: piece.data } : {}),
    ...(piece.value !== undefined ? { value: piece.value } : {}),
  };
}

export function summarize(
  state: TableState,
  catalog: Catalog,
  object: TableObject,
  reveal = false,
): ObjectSummary {
  const pieces =
    object.kind === 'stack' ? object.items.map((id) => state.objects[id] as Piece) : [object];
  const top = pieces.at(-1)!;
  const type = catalog[top.type];
  return {
    id: object.id,
    kind: object.kind,
    pos: object.pos,
    rot: object.rot,
    size: type ? sizeOf(type) : [0, 0],
    ...(object.locked ? { locked: true } : {}),
    top: summarizePiece(top, catalog, reveal),
    ...(object.kind === 'stack'
      ? {
          count: pieces.length,
          ...(reveal ? { items: pieces.map((p) => summarizePiece(p, catalog, true)) } : {}),
        }
      : {}),
    ...(object.kind === 'piece' && object.parent ? { parent: object.parent } : {}),
  };
}

/** Objects lying directly on the table, bottom to top. */
export function tableObjects(state: TableState): TableObject[] {
  return Object.values(state.objects)
    .filter((o) => !(o.kind === 'piece' && o.parent))
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

export function queryObjects(
  state: TableState,
  catalog: Catalog,
  query: ObjectQuery = {},
): ObjectSummary[] {
  let objects: TableObject[];
  if (query.inside) {
    const stack = state.objects[query.inside];
    if (stack?.kind !== 'stack') throw new Error(`"${query.inside}" is not a stack.`);
    objects = stack.items.map((id) => state.objects[id]!);
  } else {
    objects = tableObjects(state);
  }
  return objects
    .map((o) => summarize(state, catalog, o, query.reveal))
    .filter((s) => {
      if (query.type && s.top.type !== query.type) return false;
      if (query.base && s.top.base !== query.base) return false;
      if (query.where) {
        for (const [key, value] of Object.entries(query.where)) {
          if (s.top.data?.[key] !== value) return false;
        }
      }
      if (query.region) {
        const [x, y, w, h] = query.region;
        if (s.pos[0] < x || s.pos[0] > x + w || s.pos[1] < y || s.pos[1] > y + h) return false;
      }
      return true;
    });
}

/** A compact text description of the table, for a language model to read. */
export function describeTable(
  state: TableState,
  catalog: Catalog,
  options: { reveal?: boolean } = {},
): string {
  const summaries = tableObjects(state).map((o) => summarize(state, catalog, o, options.reveal));
  if (summaries.length === 0) return `Table "${state.table}" is empty.`;
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of summaries) {
    x0 = Math.min(x0, s.pos[0] - s.size[0] / 2);
    y0 = Math.min(y0, s.pos[1] - s.size[1] / 2);
    x1 = Math.max(x1, s.pos[0] + s.size[0] / 2);
    y1 = Math.max(y1, s.pos[1] + s.size[1] / 2);
  }
  const lines = [
    `Table "${state.table}": ${summaries.length} objects, covering x ${num(x0)} to ${num(x1)} ` +
      `and y ${num(y0)} to ${num(y1)} mm. Positions are centres in mm; y grows downwards.`,
    `Free space: anywhere below y ${num(y1)} or right of x ${num(x1)}.`,
    '',
  ];
  const stacks = summaries.filter((s) => s.kind === 'stack');
  const pieces = summaries.filter((s) => s.kind === 'piece');
  if (stacks.length) {
    lines.push('Piles (stacks):');
    for (const s of stacks) {
      const top = s.top.face === 'down' ? 'top face down' : `top: ${pieceText(s.top, catalog)}`;
      lines.push(`- ${s.id}: ${s.count} × ${typeName(s.top, catalog)}, ${top}${where(s)}`);
      if (s.items) {
        lines.push(
          `  bottom to top: ${s.items.map((p) => `${p.id}${dataText(p.data)}${p.face === 'down' ? ' (down)' : ''}`).join(', ')}`,
        );
      }
    }
    lines.push('');
  }
  if (pieces.length) {
    lines.push('Pieces:');
    for (const s of pieces) lines.push(`- ${s.id}: ${pieceText(s.top, catalog)}${where(s)}`);
  }
  return lines.join('\n').trimEnd();
}

function typeName(p: PieceSummary, catalog: Catalog): string {
  const name = catalog[p.type]?.name;
  return name ? `${name} (${p.type}, ${p.base})` : `${p.type} (${p.base})`;
}

function pieceText(p: PieceSummary, catalog: Catalog): string {
  const parts = [typeName(p, catalog)];
  if (p.face === 'down') parts.push('face down');
  else if (p.face === 'up' && p.data) parts.push('face up');
  if (p.value !== undefined) parts.push(`value ${p.value}`);
  return parts.join(', ') + dataText(p.data);
}

function dataText(data: Record<string, unknown> | undefined): string {
  if (!data || Object.keys(data).length === 0) return '';
  const fields = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  return fields.length ? ` {${fields.join('; ')}}` : '';
}

function where(s: ObjectSummary): string {
  const extras = [`at [${num(s.pos[0])}, ${num(s.pos[1])}]`];
  if (s.rot) extras.push(`rotated ${s.rot}°`);
  if (s.locked) extras.push('locked');
  return ', ' + extras.join(', ');
}

function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}
