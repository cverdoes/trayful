// Starting points for new component types, and checks for a type while it is being edited.
import { flattenIssues, type Problem } from './diagnostics.js';
import { normalizeField } from './fields.js';
import { slugify } from './inventory.js';
import { ComponentType } from './schemas.js';
import { typeProblems } from './type-checks.js';

/** A common component to start a new type from: everything but its id. */
export interface TypePreset {
  name: string;
  type: Omit<ComponentType, 'id'>;
}

const PAPER = '#ffffff';
const INK = '#222222';

/** Common sizes in millimetres, as printers and game makers sell them. */
export const TYPE_PRESETS: readonly TypePreset[] = [
  {
    name: 'Poker card',
    type: { base: 'card', size: [63, 88], corner: 3, front: { fill: PAPER }, back: { fill: INK } },
  },
  {
    name: 'Mini card',
    type: { base: 'card', size: [44, 63], corner: 3, front: { fill: PAPER }, back: { fill: INK } },
  },
  { name: 'Square tile', type: { base: 'tile', size: 50, front: { fill: PAPER } } },
  { name: 'Hex tile', type: { base: 'tile', size: 50, shape: 'hex', front: { fill: PAPER } } },
  { name: 'Round token', type: { base: 'token', size: 25, shape: 'circle', fill: '#e0b040' } },
  { name: 'Meeple', type: { base: 'meeple', size: 16, fill: '#c0392b' } },
  { name: 'Six-sided die', type: { base: 'die', size: 16, faces: [1, 2, 3, 4, 5, 6] } },
  { name: 'Counter', type: { base: 'counter', size: [30, 20], range: [0, 99] } },
  { name: 'Board', type: { base: 'board', size: [300, 300], front: { fill: '#e8dcc0' } } },
];

/**
 * An id for a new type made from `name` that no type in `taken` has yet:
 * `event-card`, then `event-card-2`, and so on.
 */
export function freeTypeId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name) || 'type';
  const numbered = (n: number) => (n === 1 ? base : `${base}-${n}`);
  let n = 1;
  while (used.has(numbered(n))) n++;
  return numbered(n);
}

/**
 * Everything wrong with a type that is being edited, each at the path of the
 * value that causes it, so an editor can show it next to that value. Checks
 * the type on its own; problems that need the rest of the project (an unknown
 * image file, inventory rows that no longer fit) are found when it is saved.
 */
export function typeDraftProblems(draft: unknown): Problem[] {
  const result = ComponentType.safeParse(draft);
  if (!result.success) return flattenIssues(result.error.issues);
  const fields = Object.fromEntries(
    Object.entries(result.data.fields ?? {}).map(([name, field]) => [name, normalizeField(field)]),
  );
  return typeProblems(result.data, fields);
}

/**
 * Whether two values parsed from YAML or JSON are the same, whatever order their
 * keys are in: a type read back from its file lists keys in the file's order,
 * while the same type edited in the designer may not.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortedKeys(a)) === JSON.stringify(sortedKeys(b));
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, sortedKeys(v)]),
  );
}
