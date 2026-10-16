// Starting points for new components, and checks for a component while it is being edited.
import { flattenIssues, type Problem } from './diagnostics.js';
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
    type: {
      size: [63, 88],
      is: 'piece',
      face: { corner: 3, fill: PAPER },
      flippable: { back: { fill: INK } },
      rotates: true,
      stackable: true,
    },
  },
  {
    name: 'Mini card',
    type: {
      size: [44, 63],
      is: 'piece',
      face: { corner: 3, fill: PAPER },
      flippable: { back: { fill: INK } },
      rotates: true,
      stackable: true,
    },
  },
  {
    name: 'Square tile',
    type: {
      size: 50,
      is: 'piece',
      face: { fill: PAPER },
      flippable: true,
      rotates: true,
      stackable: true,
    },
  },
  {
    name: 'Hex tile',
    type: {
      size: 50,
      is: 'piece',
      face: { shape: 'hex', fill: PAPER },
      flippable: true,
      rotates: { step: 60 },
      stackable: true,
    },
  },
  {
    name: 'Round token',
    type: { size: 25, is: 'piece', face: { shape: 'circle', fill: '#e0b040' }, stackable: true },
  },
  { name: 'Meeple', type: { size: 16, is: 'piece', face: { shape: 'meeple', fill: '#c0392b' } } },
  {
    name: 'Six-sided die',
    type: { size: 16, is: 'die', face: { corner: 2 }, values: { range: [1, 6] } },
  },
  { name: 'Counter', type: { size: [30, 20], is: 'counter', values: { range: [0, 99] } } },
  {
    name: 'Board',
    type: { size: [300, 300], is: 'piece', face: { fill: '#e8dcc0' }, rotates: true },
  },
  {
    name: 'Zone',
    type: {
      size: [100, 70],
      is: 'zone',
      container: [{ id: 'area', area: { at: [0, 0], size: [100, 70] } }],
    },
  },
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
  return typeProblems(result.data);
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
