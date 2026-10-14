import { coerceValue } from './fields.js';
import type { ResolvedType } from './resolved.js';
import type { InventoryEntry, Scalar } from './schemas.js';

/** One design in an inventory entry, before it is checked against its type. */
export interface Row {
  values: Record<string, Scalar>;
  /** Values read from CSV are text, and are converted to the field's type. */
  fromText: boolean;
  /** Reports a problem with the row, or with one of its fields. */
  report: (field: string | undefined, message: string) => void;
  /** The row's part of the component id, when the entry decides it. */
  key: string | undefined;
}

/** A row that passed its checks: the component data, and how many copies to make. */
export interface ResolvedRow {
  data: Record<string, Scalar>;
  count: number;
  key: string;
}

/**
 * Checks a row against its type and fills in defaults. Problems are reported
 * through the row; the result is undefined when there were any.
 */
export function resolveRow(
  type: ResolvedType,
  entry: InventoryEntry,
  row: Row,
  index: number,
): ResolvedRow | undefined {
  const { count: rawCount, id: rawId, ...values } = row.values;
  const data = rowData(type, entry, values, row);
  const count = rowCount(entry, rawCount, row);
  if (!data || count === undefined) return undefined;
  const key = rawId !== undefined && rawId !== '' ? slugify(String(rawId)) : row.key;
  return { data, count, key: key ?? rowKey(data, index) };
}

/** Defaults, then the entry's shared data, then the row's own values. */
function rowData(
  type: ResolvedType,
  entry: InventoryEntry,
  values: Record<string, Scalar>,
  row: Row,
): Record<string, Scalar> | undefined {
  const data: Record<string, Scalar> = { ...fieldDefaults(type), ...entry.data };
  let ok = true;
  const invalid = new Set<string>();
  for (const [name, raw] of givenValues(values, row.fromText)) {
    const field = type.normalizedFields[name];
    if (!field) {
      row.report(name, `"${name}" is not a field of "${type.id}".`);
      ok = false;
      continue;
    }
    const result = coerceValue(field, raw, row.fromText);
    if ('error' in result) {
      row.report(name, `"${name}" ${result.error}.`);
      invalid.add(name);
      ok = false;
    } else data[name] = result.value;
  }
  for (const name of missingFields(type, data, invalid)) {
    row.report(undefined, `Missing value for field "${name}".`);
    ok = false;
  }
  return ok ? data : undefined;
}

/** The row's values, leaving out empty CSV cells so defaults and optional fields apply. */
function givenValues(values: Record<string, Scalar>, fromText: boolean): [string, Scalar][] {
  return Object.entries(values).filter(([, raw]) => !(fromText && raw === ''));
}

function fieldDefaults(type: ResolvedType): Record<string, Scalar> {
  const defaults: Record<string, Scalar> = {};
  for (const [name, field] of Object.entries(type.normalizedFields)) {
    if (field.default !== undefined) defaults[name] = field.default;
  }
  return defaults;
}

/** Required fields with no value, leaving out those whose value was reported as invalid. */
function missingFields(
  type: ResolvedType,
  data: Record<string, Scalar>,
  invalid: Set<string>,
): string[] {
  return Object.entries(type.normalizedFields)
    .filter(([name, field]) => data[name] === undefined && !field.optional && !invalid.has(name))
    .map(([name]) => name);
}

/** The row's `count`, else the entry's, else 1; undefined when the row's is not valid. */
function rowCount(entry: InventoryEntry, raw: Scalar | undefined, row: Row): number | undefined {
  if (raw === undefined || (row.fromText && raw === '')) return entry.count ?? 1;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1) return n;
  row.report('count', `"count" must be a whole number of at least 1.`);
  return undefined;
}

/** The ids for `count` copies of a design, skipping ids already in `used`, which it adds them to. */
export function componentIds(baseId: string, count: number, used: Set<string>): string[] {
  const ids: string[] = [];
  for (let copy = 1; copy <= count; copy++) {
    const id = unusedId(count > 1 ? `${baseId}.${copy}` : baseId, used);
    used.add(id);
    ids.push(id);
  }
  return ids;
}

/** One combination per value of each key, e.g. every colour with every size. */
export function cartesian(each: Record<string, Scalar[]>): Record<string, Scalar>[] {
  let combos: Record<string, Scalar>[] = [{}];
  for (const [key, values] of Object.entries(each)) {
    combos = combos.flatMap((c) => values.map((v) => ({ ...c, [key]: v })));
  }
  return combos;
}

/** `base`, or `base~2`, `base~3`… when that id is already taken. */
function unusedId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}~${n}`;
    n++;
  }
  return id;
}

/** A readable row key: the first text field's value (usually the name), else the row number. */
function rowKey(data: Record<string, Scalar>, index: number): string {
  const text =
    typeof data.name === 'string' && slugify(data.name) !== ''
      ? data.name
      : Object.values(data).find((v) => typeof v === 'string' && slugify(v) !== '');
  return typeof text === 'string' ? slugify(text) : String(index + 1);
}

/** Runs of other characters become one dash, so trimming one dash at each end is enough. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
