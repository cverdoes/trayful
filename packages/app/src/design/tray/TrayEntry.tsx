// One inventory entry in the Tray: its deck and copies, and the designs it makes.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { NumberInput, TextInput } from '../panel/controls';
import { CsvGrid } from './CsvGrid';
import { DesignGrid } from './DesignGrid';
import { ListInput } from './TrayCells';
import {
  designCount,
  shapeOf,
  withKey,
  nonEmpty,
  withEntry,
  type Column,
  type CsvTable,
  type EntryShape,
  type TrayEntry,
} from './tray';

const SHAPE_TEXT: Record<EntryShape, string> = {
  one: 'One design',
  rows: 'A design per row',
  each: 'Every combination',
  csv: 'A design per row of',
};

/** What an entry needs to show its designs. */
export interface EntryContext {
  columns: Column[];
  /** The image the component picks tiles of, if it does. */
  image?: Asset;
  tables: Record<string, CsvTable>;
  /** A CSV file changed; `alone` makes the change a step of its own to undo. */
  onTable: (file: string, table: CsvTable, alone?: boolean) => void;
}

/** An entry, with its deck and copies, and the designs it makes. */
export function TrayEntryCard({
  entry,
  index,
  context,
  onChange,
}: Readonly<{
  entry: TrayEntry;
  index: number;
  context: EntryContext;
  /** The changed entry, or undefined to take it out. */
  onChange: (entry: TrayEntry | undefined) => void;
}>) {
  const shape = shapeOf(entry);
  const designs = designCount(entry, context.tables);
  const copies = entry.count ?? 1;
  return (
    <section className="tray-entry" aria-label={`Entry ${index + 1}`}>
      <header>
        <h3>
          {SHAPE_TEXT[shape]} {shape === 'csv' && <code>{entry.from}</code>}
        </h3>
        <label>
          Deck{' '}
          <TextInput
            value={entry.deck}
            placeholder="none"
            onChange={(deck) => onChange(withKey(entry, 'deck', deck))}
          />
        </label>
        <label>
          Copies of each{' '}
          <NumberInput
            value={entry.count}
            placeholder="1"
            onChange={(count) => onChange(withKey(entry, 'count', count))}
          />
        </label>
        <span className="muted">
          {designs} {designs === 1 ? 'design' : 'designs'}
          {copies > 1 && `, ${copies} of each`}
        </span>
        <button type="button" onClick={() => onChange(undefined)}>
          Remove
        </button>
      </header>
      <EntryBody entry={entry} context={context} onChange={onChange} />
    </section>
  );
}

function EntryBody({
  entry,
  context,
  onChange,
}: Readonly<{
  entry: TrayEntry;
  context: EntryContext;
  onChange: (entry: TrayEntry) => void;
}>) {
  switch (shapeOf(entry)) {
    case 'rows':
      return (
        <DesignGrid
          rows={entry.items!}
          columns={context.columns}
          image={context.image}
          withCount
          onRows={(items) => onChange(withKey(entry, 'items', items))}
        />
      );
    case 'each':
      return <Combinations entry={entry} context={context} onChange={onChange} />;
    case 'csv':
      return (
        <CsvGrid
          table={context.tables[entry.from!] ?? { header: [], rows: [] }}
          columns={context.columns}
          onChange={(table, alone) => context.onTable(entry.from!, table, alone)}
        />
      );
    default:
      return (
        <DesignGrid
          rows={[entry.data ?? {}]}
          columns={context.columns}
          image={context.image}
          onRows={([data]) => onChange(withKey(entry, 'data', nonEmpty(data)))}
        />
      );
  }
}

/** A list of values per field; every combination of them is a design. */
function Combinations({
  entry,
  context,
  onChange,
}: Readonly<{ entry: TrayEntry; context: EntryContext; onChange: (entry: TrayEntry) => void }>) {
  const each = entry.each ?? {};
  const set = (name: string, values: Scalar[] | undefined) =>
    onChange({ ...entry, each: withEntry(each, name, values) });
  const { image } = context;
  return (
    <div className="tray-each">
      {context.columns.map(({ name }) => (
        <label key={name}>
          {name}{' '}
          <ListInput values={each[name]} label={name} onChange={(values) => set(name, values)} />
          {name === 'tile' && image && (
            <button
              type="button"
              onClick={() =>
                set(
                  name,
                  Array.from({ length: image.rows * image.cols }, (_, i) => i),
                )
              }
            >
              Every tile
            </button>
          )}
        </label>
      ))}
    </div>
  );
}
