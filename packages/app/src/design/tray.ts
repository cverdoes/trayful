// The Tray's model: one component's inventory entries, as the designer edits them.
// Pure, so what each edit writes can be tested.
import {
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

/** How an entry makes its designs: one, a row each, every combination, or a row of a CSV file each. */
export type EntryShape = 'one' | 'rows' | 'each' | 'csv';

export function shapeOf(entry: TrayEntry): EntryShape {
  if (entry.items) return 'rows';
  if (entry.each) return 'each';
  return entry.from === undefined ? 'one' : 'csv';
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

/** A new, empty entry of a shape. */
export function newEntry(shape: Exclude<EntryShape, 'csv'>): TrayEntry {
  if (shape === 'rows') return { items: [{}] };
  if (shape === 'each') return { each: {} };
  return {};
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
export function nonEmpty(values: Values | undefined): Values | undefined {
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

/** How many designs an entry makes, before each is copied `count` times. */
export function designCount(entry: TrayEntry, tables: Record<string, CsvTable>): number {
  switch (shapeOf(entry)) {
    case 'rows':
      return entry.items!.length;
    case 'each':
      return Object.values(entry.each!).reduce((n, values) => n * values.length, 1);
    case 'csv':
      return tables[entry.from!]?.rows.length ?? 0;
    default:
      return 1;
  }
}
