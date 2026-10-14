import { describe, expect, it } from 'vitest';
import { normalizeField } from './fields.js';
import { cartesian, componentIds, resolveRow, slugify, type Row } from './inventory.js';
import type { ResolvedType } from './resolved.js';
import type { InventoryEntry, Scalar } from './schemas.js';

const card = {
  id: 'card',
  normalizedFields: {
    name: normalizeField('string'),
    cost: normalizeField({ type: 'int', default: 0 }),
    note: normalizeField('string?'),
  },
} as unknown as ResolvedType;

function resolve(
  values: Record<string, Scalar>,
  options: Partial<Row> = {},
  entry: Partial<InventoryEntry> = {},
) {
  const reports: string[] = [];
  const row: Row = {
    values,
    fromText: false,
    key: undefined,
    report: (field, message) => reports.push(field ? `${field}: ${message}` : message),
    ...options,
  };
  const result = resolveRow(card, { type: 'card', ...entry }, row, 4);
  return { result, reports };
}

describe('resolveRow', () => {
  it('fills defaults, then shared data, then the row’s values', () => {
    const { result } = resolve({ name: 'Seed' }, {}, { data: { cost: 1 } });
    expect(result).toEqual({ data: { name: 'Seed', cost: 1 }, count: 1, key: 'seed' });
  });

  it('reports unknown fields, bad values and missing ones together', () => {
    const { result, reports } = resolve({ colour: 'red', cost: 'x' });
    expect(result).toBeUndefined();
    expect(reports).toEqual([
      'colour: "colour" is not a field of "card".',
      'cost: "cost" must be a number.',
      'Missing value for field "name".',
    ]);
  });

  it('skips empty CSV cells, so defaults and optional fields still apply', () => {
    const { result } = resolve({ name: 'Seed', cost: '', note: '' }, { fromText: true });
    expect(result?.data).toEqual({ name: 'Seed', cost: 0 });
  });

  it('takes the row’s count over the entry’s, and checks it', () => {
    expect(resolve({ name: 'A', count: 3 }, {}, { count: 2 }).result?.count).toBe(3);
    expect(resolve({ name: 'A' }, {}, { count: 2 }).result?.count).toBe(2);
    expect(resolve({ name: 'A', count: '' }, { fromText: true }).result?.count).toBe(1);
    expect(resolve({ name: 'A', count: 0 }).reports).toEqual([
      'count: "count" must be a whole number of at least 1.',
    ]);
  });

  it('keys a row by its id, else the entry’s key, else its first text, else its number', () => {
    expect(resolve({ name: 'A', id: 'Big One' }).result?.key).toBe('big-one');
    expect(resolve({ name: 'A' }, { key: 'red-2' }).result?.key).toBe('red-2');
    expect(resolve({ name: '!!' }).result?.key).toBe('5');
  });
});

describe('componentIds', () => {
  it('numbers copies, and adds ~2 when an id is taken', () => {
    const used = new Set(['card.seed']);
    expect(componentIds('card.seed', 1, used)).toEqual(['card.seed~2']);
    expect(componentIds('card.oak', 2, used)).toEqual(['card.oak.1', 'card.oak.2']);
    expect(used.has('card.oak.2')).toBe(true);
  });
});

describe('cartesian', () => {
  it('makes every combination of the values', () => {
    expect(cartesian({ color: ['red', 'blue'], size: [1, 2] })).toEqual([
      { color: 'red', size: 1 },
      { color: 'red', size: 2 },
      { color: 'blue', size: 1 },
      { color: 'blue', size: 2 },
    ]);
  });
});

describe('slugify', () => {
  it('keeps letters and digits, drops accents and joins the rest with dashes', () => {
    expect(slugify('  Crème Brûlée #2! ')).toBe('creme-brulee-2');
  });
});
