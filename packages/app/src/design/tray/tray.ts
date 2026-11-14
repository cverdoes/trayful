// The Tray's model: one component's inventory entries, as the designer edits them.
// Pure, so what each edit writes can be tested.
import {
  coerceValue,
  componentFields,
  imageRefs,
  slugify,
  type Asset,
  type ComponentType,
  type NormalizedField,
  type Scalar,
} from '@trayful/formats/browser';

export type Values = Record<string, Scalar>;

/** An inventory entry without `component`, which the Tray it is in decides. */
export interface TrayEntry {
  count?: number;
  deck?: string;
  data?: Values;
  items?: Values[];
  from?: string;
  each?: Record<string, Scalar[]>;
}

/** A CSV file: its header row, and the rows below it. */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

/** One component's entries, and the CSV files they read rows from, by file. */
export interface TrayData {
  entries: TrayEntry[];
  tables: Record<string, CsvTable>;
}

/** The tray with only the CSV files its entries read, as saving it sends them. */
export function withUsedTables(tray: TrayData): TrayData {
  const used = new Set(tray.entries.flatMap((e) => (e.from === undefined ? [] : [e.from])));
  const tables = Object.entries(tray.tables).filter(([file]) => used.has(file));
  return { ...tray, tables: Object.fromEntries(tables) };
}

/**
 * How an entry makes its designs: typed in as rows, every combination of some
 * values, or a row of a CSV file each.
 */
export type EntryShape = 'rows' | 'each' | 'csv';

export function shapeOf(entry: TrayEntry): EntryShape {
  if (entry.each) return 'each';
  return entry.from === undefined ? 'rows' : 'csv';
}

/**
 * The designs typed into an entry, a row each. The inventory writes a single
 * design as the entry's `data` and several as its `items`; the Tray shows both
 * as rows.
 */
export function designRows(entry: TrayEntry): Values[] {
  return entry.items ?? [entry.data ?? {}];
}

/**
 * The entry with its typed designs changed. A single design with no copies of
 * its own stays the entry's `data`, as a hand-written inventory has it; more
 * rows, or a row's own copies, make them `items`.
 */
export function withDesignRows(entry: TrayEntry, rows: Values[]): TrayEntry {
  if (entry.items) return { ...entry, items: rows };
  const [only] = rows;
  if (rows.length === 1 && only?.count === undefined) return withKey(entry, 'data', nonEmpty(only));
  return { ...withKey(entry, 'data', undefined), items: rows };
}

/** A field the Tray fills in for each design. */
export interface Column {
  name: string;
  field: NormalizedField;
}

/** The fields each design fills in: the tile first, when the component picks one. */
export function columnsOf(type: ComponentType): Column[] {
  return Object.entries(componentFields(type))
    .map(([name, field]) => ({ name, field }))
    .sort((a, b) => Number(b.name === 'tile') - Number(a.name === 'tile'));
}

/** The image each component picks a tile of, when it picks one. */
export function tiledImage(type: ComponentType, images: Record<string, Asset>): Asset | undefined {
  const picked = imageRefs(type).find(
    ({ ref }) => typeof ref === 'object' && ref.tile === 'instance',
  );
  return picked && typeof picked.ref === 'object' ? images[picked.ref.asset] : undefined;
}

/** One design per tile of an image, as a deck named after the component. */
export function everyTile(type: ComponentType, image: Asset): TrayEntry {
  const tiles = Array.from({ length: image.rows * image.cols }, (_, i) => i);
  return { deck: deckName(type), each: { tile: tiles } };
}

/** A deck name that suits the component: its name as a slug. */
function deckName(type: ComponentType): string {
  return slugify(type.name ?? type.id) || 'deck';
}

/** A new, empty entry of a shape: one design to fill in, or no values to combine yet. */
export function newEntry(shape: Exclude<EntryShape, 'csv'>): TrayEntry {
  return shape === 'each' ? { each: {} } : {};
}

/** `values` with one key set, or taken out when `value` is undefined; undefined when empty. */
export function withValue(
  values: Values | undefined,
  key: string,
  value: Scalar | undefined,
): Values | undefined {
  return nonEmpty(withEntry(values ?? {}, key, value));
}

/** Values, or undefined when there are none. */
function nonEmpty(values: Values | undefined): Values | undefined {
  return values && Object.keys(values).length ? values : undefined;
}

/** `entry` with one key set, or taken out when `value` is undefined. */
export function withKey<K extends keyof TrayEntry>(
  entry: TrayEntry,
  key: K,
  value: TrayEntry[K] | undefined,
): TrayEntry {
  return withEntry<unknown>({ ...entry }, key, value);
}

/** A record with one key set, or taken out when `value` is undefined. */
export function withEntry<T>(
  record: Readonly<Record<string, T>>,
  key: string,
  value: T | undefined,
): Record<string, T> {
  const others = Object.entries(record).filter(([k]) => k !== key);
  return Object.fromEntries(value === undefined ? others : [...others, [key, value]]);
}

/** A list with one element replaced, or taken out when `value` is undefined. */
export function replaced<T>(list: readonly T[], index: number, value: T | undefined): T[] {
  return value === undefined
    ? list.filter((_, i) => i !== index)
    : list.map((item, i) => (i === index ? value : item));
}

/** A CSV table with a column added at the end, empty in every row. */
export function withColumn(table: CsvTable, name: string): CsvTable {
  return { header: [...table.header, name], rows: table.rows.map((row) => [...row, '']) };
}

/** A CSV table without one of its columns. */
export function withoutColumn(table: CsvTable, index: number): CsvTable {
  return {
    header: replaced(table.header, index, undefined),
    rows: table.rows.map((row) => replaced(row, index, undefined)),
  };
}

/** The first field a CSV table has no column for yet, to name a new column after. */
export function nextColumn(table: CsvTable, columns: Column[]): string {
  return columns.find(({ name }) => !table.header.includes(name))?.name ?? '';
}

/** How many designs an entry makes, before each is copied `count` times. */
export function designCount(entry: TrayEntry, tables: Record<string, CsvTable>): number {
  switch (shapeOf(entry)) {
    case 'rows':
      return designRows(entry).length;
    case 'each':
      return Object.values(entry.each!).reduce((n, values) => n * values.length, 1);
    case 'csv':
      return tables[entry.from!]?.rows.length ?? 0;
  }
}

/**
 * How many pieces an entry puts in the box: each design as many times as its own
 * number of copies says, or the entry's when it has none.
 */
export function pieceCount(entry: TrayEntry, tables: Record<string, CsvTable>): number {
  const copies = entry.count ?? 1;
  const sum = (own: unknown[]) =>
    own.reduce<number>((n, count) => n + (typeof count === 'number' ? count : copies), 0);
  switch (shapeOf(entry)) {
    case 'rows':
      return sum(designRows(entry).map((row) => row.count));
    case 'each':
      return designCount(entry, tables) * copies;
    case 'csv': {
      const table = tables[entry.from!] ?? { header: [], rows: [] };
      const at = table.header.indexOf('count');
      // An empty or unreadable cell leaves the number to the entry.
      return sum(
        table.rows.map((row) => (/^\d+$/.test(row[at] ?? '') ? Number(row[at]) : undefined)),
      );
    }
  }
}

/** A CSV cell as a value of its field's kind; a row's `count` is a number. */
function typedValue(name: string, text: string, field: NormalizedField | undefined): Scalar {
  const kind: NormalizedField | undefined =
    name === 'count' ? { type: 'int', optional: true } : field;
  const coerced = kind ? coerceValue(kind, text, true) : { value: text };
  return 'value' in coerced ? coerced.value : text;
}

/**
 * A CSV entry with the file's rows brought into the inventory as typed designs.
 * A cell becomes a value of its field's kind, a number for a whole-number field;
 * text that does not fit stays as it is, for the project's checks to report. An
 * empty cell gives no value, as in the file.
 */
export function broughtIn(entry: TrayEntry, table: CsvTable, columns: Column[]): TrayEntry {
  const fields = new Map(columns.map(({ name, field }) => [name, field]));
  const items = table.rows.map((row) =>
    Object.fromEntries(
      table.header
        .map((name, j): [string, string] => [name, row[j] ?? ''])
        .filter(([name, text]) => name !== '' && text !== '')
        .map(([name, text]): [string, Scalar] => [name, typedValue(name, text, fields.get(name))]),
    ),
  );
  return { ...withKey(entry, 'from', undefined), items };
}
