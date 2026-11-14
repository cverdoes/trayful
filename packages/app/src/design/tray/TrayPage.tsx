// The Tray: what is in the box of the component picked in the list, edited in
// place and saved to the inventory as you go.
import { useRef } from 'react';
import type { Asset, ComponentType } from '@trayful/formats/browser';
import { useStore } from '../../store';
import { IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Icon, type IconName } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { useDesign } from '../store';
import {
  columnsOf,
  everyTile,
  newEntry,
  replaced,
  tiledImage,
  type CsvTable,
  type TrayEntry,
} from './tray';
import { TrayEntryCard, type EntryContext } from './TrayEntry';
import { useHistoryKeys } from '../panel/UndoButtons';
import { useTray, type TrayStatus } from './useTray';

export function TrayPage() {
  const id = useDesign((s) => s.draft?.id);
  const type = useStore((s) => (id ? s.view?.types[id] : undefined));
  if (!type) {
    return (
      <main className="tray-page">
        <EmptyState icon="box" title="No component picked">
          Pick a component in the list, or make a new one.
        </EmptyState>
      </main>
    );
  }
  if (type.is === 'stamp') {
    return (
      <main className="tray-page">
        <EmptyState icon="box" title="Stamps are not kept in the box">
          Any number of them can be pressed into the boxes of a sheet that accepts them.
        </EmptyState>
      </main>
    );
  }
  // A new key for each component, so nothing typed for one shows up for another.
  return <TrayEditor key={type.id} type={type} />;
}

/** What the save status shows: an icon, a few words, and the whole of it on hover. */
const STATUS: Record<TrayStatus, { icon: IconName; text: string; title: string }> = {
  loading: { icon: 'spinner', text: 'Loading…', title: 'Reading the inventory' },
  saved: { icon: 'check', text: 'Saved', title: 'Saved to the inventory' },
  unsaved: { icon: 'spinner', text: 'Saving soon…', title: 'Saved a moment after you stop typing' },
  saving: { icon: 'spinner', text: 'Saving…', title: 'Writing the inventory' },
  failed: { icon: 'alert', text: 'Not saved', title: 'The inventory could not be saved' },
};

function TrayEditor({ type }: Readonly<{ type: ComponentType }>) {
  const { tray, status, message, edit, addCsv, toCsv, steps, undo, redo } = useTray(type.id);
  const images = useStore((s) => s.view?.assets.images ?? {});
  const inBox = useDesign((s) => s.components.filter((c) => c.type === type.id).length);
  useHistoryKeys(undo, redo);
  const image = tiledImage(type, images);
  const entries = tray?.entries ?? [];
  const setEntries = (next: TrayEntry[]) => tray && edit({ ...tray, entries: next });
  const context: EntryContext = {
    columns: columnsOf(type),
    image,
    tables: tray?.tables ?? {},
    onTable: (file: string, table: CsvTable, alone?: boolean) =>
      tray && edit({ ...tray, tables: { ...tray.tables, [file]: table } }, alone),
    onToCsv: status === 'failed' ? undefined : toCsv,
  };
  return (
    <main className="tray-page" aria-label="Tray">
      <header className="tray-header">
        <div className="tray-title">
          <h2>{type.name ?? type.id}</h2>
          <p>{inBox} in the box</p>
        </div>
        <div className={`tray-status save-${status}`} role="status" title={STATUS[status].title}>
          <Icon name={STATUS[status].icon} />
          {STATUS[status].text}
          {message && <span className="error">{message}</span>}
        </div>
        <IconButton
          icon="undo"
          label="Undo"
          title="Undo (Ctrl+Z)"
          disabled={steps.past.length === 0}
          onClick={undo}
        />
        <IconButton
          icon="redo"
          label="Redo"
          title="Redo (Ctrl+Shift+Z)"
          disabled={steps.future.length === 0}
          onClick={redo}
        />
        {tray && (
          <AddMenu
            type={type}
            image={image}
            onAdd={(entry) => setEntries([...entries, entry])}
            onCsv={addCsv}
          />
        )}
      </header>
      {entries.length === 0 && tray && (
        <EmptyState icon="box" title="None of these are in the box yet">
          The Tray lists what the box holds of this component. Use Add to type designs in, make
          every combination of some values, or read them from a CSV file.
        </EmptyState>
      )}
      {entries.map((entry, i) => (
        <TrayEntryCard
          // Entries have no id of their own; their place is what identifies them here.
          key={i}
          entry={entry}
          index={i}
          context={context}
          onChange={(next) => setEntries(replaced(entries, i, next))}
        />
      ))}
    </main>
  );
}

/** The one way to put more of the component in the box: a menu of the kinds of entry. */
function AddMenu({
  type,
  image,
  onAdd,
  onCsv,
}: Readonly<{
  type: ComponentType;
  /** The image the component picks tiles of, if it does. */
  image: Asset | undefined;
  onAdd: (entry: TrayEntry) => void;
  onCsv: (csv: { name: string; text: string }) => void;
}>) {
  const file = useRef<HTMLInputElement>(null);
  const items: MenuItem[] = [
    {
      label: 'Designs',
      description: 'Type each design as a row of a grid',
      icon: 'grid',
      onSelect: () => onAdd(newEntry('rows')),
    },
    {
      label: 'Every combination',
      description: 'A design for each mix of the values you list',
      icon: 'layers',
      onSelect: () => onAdd(newEntry('each')),
    },
    {
      label: 'Import a CSV file',
      description: 'A design for each row of a spreadsheet file',
      icon: 'file',
      onSelect: () => file.current?.click(),
    },
  ];
  if (image) {
    items.splice(2, 0, {
      label: 'One of every tile',
      description: `A design for each tile of the image, ${image.rows * image.cols} in all`,
      icon: 'tiles',
      onSelect: () => onAdd(everyTile(type, image)),
    });
  }
  return (
    <>
      <Menu label="Add" button={{ kind: 'primary', icon: 'plus', text: 'Add' }} items={items} />
      <input
        ref={file}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void picked.text().then((text) => onCsv({ name: picked.name, text }));
        }}
      />
    </>
  );
}
