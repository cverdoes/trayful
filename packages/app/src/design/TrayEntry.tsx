// One inventory entry in the Tray: its deck and copies, and the designs it makes.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { NumberInput, TextInput } from './controls';
import { CsvGrid } from './CsvGrid';
import { FieldInput, ListInput } from './TrayCells';
import {
  designCount,
  replaced,
  shapeOf,
  withKey,
  nonEmpty,
  withEntry,
  withValue,
  type Column,
  type CsvTable,
  type EntryShape,
  type TrayEntry,
  type Values,
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
  onTable: (file: string, table: CsvTable) => void;
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
        <DesignTable
          rows={entry.items!}
          context={context}
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
          onChange={(table) => context.onTable(entry.from!, table)}
        />
      );
    default:
      return (
        <DesignTable
          rows={[entry.data ?? {}]}
          context={context}
          onRows={([data]) => onChange(withKey(entry, 'data', nonEmpty(data)))}
        />
      );
  }
}

/** Designs as rows of a table, a column per field. */
function DesignTable({
  rows,
  context,
  withCount = false,
  onRows,
}: Readonly<{
  rows: Values[];
  context: EntryContext;
  /** Whether each row has its own number of copies, and rows can be added and removed. */
  withCount?: boolean;
  onRows: (rows: Values[]) => void;
}>) {
  const { columns, image } = context;
  const set = (i: number, key: string, value: Scalar | undefined) =>
    onRows(replaced(rows, i, withValue(rows[i], key, value) ?? {}));
  return (
    <table className="tray-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.name}>{c.name}</th>
          ))}
          {withCount && <th>copies</th>}
          {withCount && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          // Rows have no id of their own; their place is what identifies them here.
          <tr key={i}>
            {columns.map((column) => (
              <td key={column.name}>
                <FieldInput
                  column={column}
                  value={row[column.name]}
                  image={image}
                  label={`${column.name}, row ${i + 1}`}
                  onChange={(value) => set(i, column.name, value)}
                />
              </td>
            ))}
            {withCount && (
              <td>
                <NumberInput
                  label={`copies, row ${i + 1}`}
                  value={typeof row.count === 'number' ? row.count : undefined}
                  placeholder="1"
                  onChange={(value) => set(i, 'count', value)}
                />
              </td>
            )}
            {withCount && (
              <td>
                <button
                  type="button"
                  aria-label={`Remove row ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => onRows(replaced(rows, i, undefined))}
                >
                  ×
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
      {withCount && (
        <tfoot>
          <tr>
            <td colSpan={columns.length + 2}>
              <button type="button" onClick={() => onRows([...rows, {}])}>
                + Row
              </button>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
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
