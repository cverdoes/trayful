// One inventory entry in the Tray: its deck and copies, and the designs it makes.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { Chip } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Field } from '../../ui/Field';
import type { IconName } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { NumberInput, TextInput } from '../panel/controls';
import { CsvGrid } from './CsvGrid';
import { DesignGrid } from './DesignGrid';
import { ListInput } from './TrayCells';
import {
  broughtIn,
  designCount,
  designRows,
  pieceCount,
  withDesignRows,
  shapeOf,
  withKey,
  withEntry,
  type Column,
  type CsvTable,
  type EntryShape,
  type TrayEntry,
} from './tray';

const SHAPE_TEXT: Record<Exclude<EntryShape, 'csv'>, string> = {
  rows: 'Designs',
  each: 'Every combination',
};

const SHAPE_ICON: Record<EntryShape, IconName> = { rows: 'grid', each: 'layers', csv: 'file' };

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

/** An entry as a card: what it makes in its header, its deck and copies, then its designs. */
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
  return (
    <Card
      label={`Entry ${index + 1}`}
      icon={SHAPE_ICON[shape]}
      title={shape === 'csv' ? <Chip>{entry.from}</Chip> : SHAPE_TEXT[shape]}
      summary={`${designs} ${designs === 1 ? 'design' : 'designs'} · ${pieceCount(entry, context.tables)} in the box`}
      actions={
        <Menu
          label={`Actions for entry ${index + 1}`}
          button={{ kind: 'icon', icon: 'more' }}
          items={[
            ...storageItems(entry, index, context, onChange),
            {
              label: 'Remove',
              icon: 'trash',
              danger: true,
              hint: 'Takes these out of the box. Undo brings them back.',
              onSelect: () => onChange(undefined),
            },
          ]}
        />
      }
    >
      <div className="tray-fields">
        <Field label="Deck">
          <TextInput
            value={entry.deck}
            placeholder="none"
            onChange={(deck) => onChange(withKey(entry, 'deck', deck))}
          />
        </Field>
        <Field label="Copies of each">
          <NumberInput
            value={entry.count}
            placeholder="1"
            onChange={(count) => onChange(withKey(entry, 'count', count))}
          />
        </Field>
      </div>
      <EntryBody entry={entry} context={context} onChange={onChange} />
    </Card>
  );
}

/**
 * Where an entry's designs are kept is a choice that can change: typed designs
 * move to a CSV file of their own, and a CSV file's rows come into the inventory.
 */
function storageItems(
  entry: TrayEntry,
  index: number,
  context: EntryContext,
  onChange: (entry: TrayEntry) => void,
): MenuItem[] {
  const shape = shapeOf(entry);
  if (shape === 'csv') {
    const table = context.tables[entry.from!];
    return [
      {
        label: 'Move to inventory',
        icon: 'move',
        hint: 'Keeps these designs in the inventory instead. The CSV file stays in the project.',
        disabled: !table,
        onSelect: () => table && onChange(broughtIn(entry, table, context.columns)),
      },
    ];
  }
  // A component with no fields has nothing to put in a file's columns.
  if (shape === 'each' || context.columns.length === 0) return [];
  return [
    {
      label: 'Move to CSV',
      icon: 'move',
      hint: context.onToCsv
        ? "Keeps these designs in a CSV file of their own, in the project's data folder."
        : 'Fix what is not saved first.',
      disabled: !context.onToCsv,
      onSelect: () => context.onToCsv?.(index),
    },
  ];
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
        <div key={name} className="tray-each-field">
          <Field label={name}>
            <ListInput values={each[name]} label={name} onChange={(values) => set(name, values)} />
          </Field>
          {name === 'tile' && image && (
            <Button
              onClick={() =>
                set(
                  name,
                  Array.from({ length: image.rows * image.cols }, (_, i) => i),
                )
              }
            >
              Every tile
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
