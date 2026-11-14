// One inventory entry in the Tray: its deck and copies, and the designs it makes.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { NumberInput, TextInput } from '../panel/controls';
import { CsvGrid } from './CsvGrid';
import { DesignGrid } from './DesignGrid';
import { ListInput } from './TrayCells';
import {
  broughtIn,
  designCount,
  designRows,
  withDesignRows,
  shapeOf,
  withKey,
  withEntry,
  type Column,
  type CsvTable,
  type EntryShape,
  type TrayEntry,
} from './tray';

const SHAPE_TEXT: Record<EntryShape, string> = {
  rows: 'Designs',
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
  /**
   * Moves the designs typed into an entry, by its place, to a CSV file of their
   * own. Undefined while a change is not saved: the server moves what it has saved.
   */
  onToCsv?: (entry: number) => void;
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
        <StorageButton entry={entry} index={index} context={context} onChange={onChange} />
        <button type="button" onClick={() => onChange(undefined)}>
          Remove
        </button>
      </header>
      <EntryBody entry={entry} context={context} onChange={onChange} />
    </section>
  );
}

/**
 * Where an entry's designs are kept is a choice that can change: typed designs
 * move to a CSV file of their own, and a CSV file's rows come into the inventory.
 */
function StorageButton({
  entry,
  index,
  context,
  onChange,
}: Readonly<{
  entry: TrayEntry;
  index: number;
  context: EntryContext;
  onChange: (entry: TrayEntry) => void;
}>) {
  const shape = shapeOf(entry);
  if (shape === 'csv') {
    const table = context.tables[entry.from!];
    return (
      <button
        type="button"
        title="Keeps these designs in the inventory instead. The CSV file stays in the project."
        disabled={!table}
        onClick={() => table && onChange(broughtIn(entry, table, context.columns))}
      >
        Move to inventory
      </button>
    );
  }
  // A component with no fields has nothing to put in a file's columns.
  if (shape === 'each' || context.columns.length === 0) return null;
  return (
    <button
      type="button"
      title={
        context.onToCsv
          ? "Keeps these designs in a CSV file of their own, in the project's data folder."
          : 'Fix what is not saved first.'
      }
      disabled={!context.onToCsv}
      onClick={() => context.onToCsv?.(index)}
    >
      Move to CSV
    </button>
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
      // A component with no fields has one design, and nothing to fill in for it.
      return context.columns.length === 0 ? null : (
        <DesignGrid
          rows={designRows(entry)}
          columns={context.columns}
          image={context.image}
          copies={entry.count ?? 1}
          onRows={(rows) => onChange(withDesignRows(entry, rows))}
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
