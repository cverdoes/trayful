import type { Vec2 } from '@trayful/formats/browser';
import { objectSize } from './layout.js';
import { allSpots, occupants } from './snap.js';
import {
  handCounts,
  handOf,
  handTarget,
  onTable,
  type Catalog,
  type Piece,
  type TableObject,
  type TableState,
} from './state.js';

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
  /** The snap spot or area the object sits in, such as `main-board/market/2`. */
  snap?: string;
  /** Stacks laid out as a `fan` or `spread`, where every piece shows. */
  layout?: 'fan' | 'spread';
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
  /** The player asking; `inside: "hand:<viewer>"` lists their own hand. */
  viewer?: string;
}

export function summarizePiece(piece: Piece, catalog: Catalog, reveal = false): PieceSummary {
  const type = catalog[piece.type];
  const hidden = piece.face === 'down' && !reveal;
  return {
    id: piece.id,
    type: piece.type,
    base: type?.base ?? 'unknown',
    face: piece.face,
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
  const layout = object.kind === 'stack' ? object.layout : undefined;
  return {
    id: object.id,
    kind: object.kind,
    pos: object.pos,
    rot: object.rot,
    size: objectSize(state, catalog, object),
    ...(object.locked ? { locked: true } : {}),
    top: summarizePiece(top, catalog, reveal),
    ...(object.kind === 'stack'
      ? {
          count: pieces.length,
          // A fan or spread shows every card's face, so its order is no secret.
          ...(reveal || layout
            ? { items: pieces.map((p) => summarizePiece(p, catalog, reveal)) }
            : {}),
        }
      : {}),
    ...(object.kind === 'piece' && object.parent ? { parent: object.parent } : {}),
    ...(object.snap ? { snap: object.snap } : {}),
    ...(layout && layout !== 'pile' ? { layout } : {}),
  };
}

/** Objects lying directly on the table, bottom to top. */
export function tableObjects(state: TableState): TableObject[] {
  return Object.values(state.objects)
    .filter(onTable)
    .sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

export function queryObjects(
  state: TableState,
  catalog: Catalog,
  query: ObjectQuery = {},
): ObjectSummary[] {
  let objects: TableObject[];
  const hand = handTarget(query.inside);
  if (hand !== undefined) {
    if (hand !== query.viewer) throw new Error('You can only look inside your own hand.');
    objects = handOf(state, hand);
  } else if (query.inside) {
    const stack = state.objects[query.inside];
    if (stack?.kind !== 'stack') throw new Error(`"${query.inside}" is not a stack.`);
    objects = stack.items.map((id) => state.objects[id]!);
  } else {
    objects = tableObjects(state);
  }
  return objects
    .map((o) => summarize(state, catalog, o, query.reveal === true || hand !== undefined))
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
  options: { reveal?: boolean; viewer?: string } = {},
): string {
  const summaries = tableObjects(state).map((o) => summarize(state, catalog, o, options.reveal));
  const hands = handLines(state, catalog, options.viewer);
  if (summaries.length === 0) {
    return [`Table "${state.table}" is empty.`, ...(hands.length ? ['', ...hands] : [])].join('\n');
  }
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
    lines.push('');
  }
  if (hands.length) lines.push(...hands, '');
  const targets = snapTargets(state, catalog);
  if (targets.length) {
    lines.push(
      'Snap targets (use these as "to" in move, draw and deal; a spot number picks one spot):',
    );
    lines.push(...targets);
  }
  return lines.join('\n').trimEnd();
}

/** The viewer's own hand in full, and how many pieces everyone else holds. */
function handLines(state: TableState, catalog: Catalog, viewer: string | undefined): string[] {
  const lines: string[] = [];
  const own = viewer ? handOf(state, viewer) : [];
  if (own.length) {
    lines.push(`Your hand (hand:${viewer}; only you see these):`);
    for (const piece of own) {
      lines.push(`- ${piece.id}: ${pieceText(summarizePiece(piece, catalog, true), catalog)}`);
    }
  }
  const others = Object.entries(handCounts(state)).filter(([player]) => player !== viewer);
  if (others.length) {
    lines.push(
      `Other players' hands (hidden; "hand:<player>" as "to" gives them pieces): ${others
        .map(([player, count]) => `${player} ${count}`)
        .join(', ')}`,
    );
  }
  return lines;
}

/** One line per snap target on the table, saying which spots are taken and by what. */
function snapTargets(state: TableState, catalog: Catalog): string[] {
  const groups = new Map<string, ReturnType<typeof allSpots>>();
  for (const spot of allSpots(state, catalog)) {
    const key = `${spot.owner}/${spot.target}`;
    groups.set(key, [...(groups.get(key) ?? []), spot]);
  }
  return [...groups].map(([key, spots]) => {
    const first = spots[0]!;
    const accepts = first.accepts ? ` (accepts ${first.accepts.join(', ')})` : '';
    if (first.area) {
      const held = occupants(state, first.ref).map((o) => o.id);
      return (
        `- ${key}${accepts}: free area of ${num(first.area[0])} × ${num(first.area[1])} mm ` +
        `centred at [${num(first.pos[0])}, ${num(first.pos[1])}]` +
        (held.length ? `, holding ${held.join(', ')}` : ', empty')
      );
    }
    const taken: string[] = [];
    const free: number[] = [];
    for (const spot of spots) {
      const held = occupants(state, spot.ref).map((o) => o.id);
      if (held.length) taken.push(`${spot.index}: ${held.join(', ')}`);
      else free.push(spot.index!);
    }
    const parts = [`${spots.length} spots`];
    if (taken.length) parts.push(`taken ${taken.join('; ')}`);
    parts.push(free.length ? `free ${ranges(free)}` : 'none free');
    return `- ${key}${accepts}: ${parts.join(', ')}`;
  });
}

/** `[0, 1, 2, 5]` as `0-2, 5`. */
function ranges(numbers: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < numbers.length; i++) {
    const start = numbers[i]!;
    while (numbers[i + 1] === numbers[i]! + 1) i++;
    out.push(numbers[i] === start ? String(start) : `${start}-${numbers[i]}`);
  }
  return out.join(', ');
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
  if (s.snap) extras.push(`in ${s.snap}`);
  if (s.layout) extras.push(`${s.layout === 'fan' ? 'fanned' : 'spread'} out`);
  if (s.rot) extras.push(`rotated ${s.rot}°`);
  if (s.locked) extras.push('locked');
  return ', ' + extras.join(', ');
}

function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}
