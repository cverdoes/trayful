// The Tray: what is in the box of the component picked in the list, edited in
// place and saved to the inventory as you go.
import type { Asset, ComponentType } from '@trayful/formats/browser';
import { useStore } from '../store';
import { useDesign } from './store';
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
import { HistoryButtons } from './UndoButtons';
import { useTray, type TrayStatus } from './useTray';

export function TrayPage() {
  const id = useDesign((s) => s.draft?.id);
  const type = useStore((s) => (id ? s.view?.types[id] : undefined));
  if (!type) {
    return <main className="tray-page muted">Pick a component, or make a new one.</main>;
  }
  if (type.is === 'stamp') {
    return (
      <main className="tray-page muted">
        Stamps are not kept in the box: any number of them can be pressed into the boxes of a sheet
        that accepts them.
      </main>
    );
  }
  // A new key for each component, so nothing typed for one shows up for another.
  return <TrayEditor key={type.id} type={type} />;
}

const STATUS_TEXT: Record<TrayStatus, string> = {
  loading: 'Loading…',
  saved: 'Saved to the inventory',
  unsaved: 'Saving soon…',
  saving: 'Saving…',
  failed: 'Not saved',
};

function TrayEditor({ type }: Readonly<{ type: ComponentType }>) {
  const { tray, status, message, edit, addCsv, steps, undo, redo } = useTray(type.id);
  const images = useStore((s) => s.view?.assets.images ?? {});
  const inBox = useDesign((s) => s.components.filter((c) => c.type === type.id).length);
  const image = tiledImage(type, images);
  const entries = tray?.entries ?? [];
  const setEntries = (next: TrayEntry[]) => tray && edit({ ...tray, entries: next });
  const add = (entry: TrayEntry) => setEntries([...entries, entry]);
  const context: EntryContext = {
    columns: columnsOf(type),
    image,
    tables: tray?.tables ?? {},
    onTable: (file: string, table: CsvTable) =>
      tray && edit({ ...tray, tables: { ...tray.tables, [file]: table } }),
  };
  return (
    <main className="tray-page" aria-label="Tray">
      <header className="tray-header">
        <h2>{type.name ?? type.id} in the box</h2>
        <span className="muted">{inBox} in the box now</span>
        <HistoryButtons
          canUndo={steps.past.length > 0}
          canRedo={steps.future.length > 0}
          onUndo={undo}
          onRedo={redo}
        />
        <div className="design-status" role="status">
          <span className={`save-${status}`}>{STATUS_TEXT[status]}</span>
          {message && <span className="error"> {message}</span>}
        </div>
      </header>
      {tray && <AddButtons type={type} image={image} onAdd={add} onCsv={addCsv} />}
      {entries.length === 0 && tray && (
        <p className="muted">None of these are in the box yet. Add some above.</p>
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

/** Ways to put more of the component in the box. */
function AddButtons({
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
  return (
    <div className="design-add">
      Add:{' '}
      {image && (
        <button type="button" onClick={() => onAdd(everyTile(type, image))}>
          One of every tile
        </button>
      )}
      <button type="button" onClick={() => onAdd(newEntry('one'))}>
        One design
      </button>
      <button type="button" onClick={() => onAdd(newEntry('rows'))}>
        Designs in rows
      </button>
      <button type="button" onClick={() => onAdd(newEntry('each'))}>
        Every combination
      </button>
      <label className="button">
        From a CSV file…
        <input
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void file.text().then((text) => onCsv({ name: file.name, text }));
          }}
        />
      </label>
    </div>
  );
}
