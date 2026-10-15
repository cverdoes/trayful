import { useEffect } from 'react';
import { go, route, showTypeInAddress } from '../route';
import { useStore } from '../store';
import { DesignCanvas } from './DesignCanvas';
import { Inspector } from './Inspector';
import { NewTypeDialog } from './NewTypeDialog';
import { SamplePicker } from './SamplePicker';
import {
  keepMine,
  loadLibrary,
  openType,
  projectChanged,
  reloadType,
  useDesign,
  type SaveStatus,
} from './store';
import { TypeList } from './TypeList';
import { UndoButtons } from './UndoButtons';
import { YamlPane } from './YamlPane';

/** Design mode: build the project's component types, saved to its library files as you go. */
export function Designer() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const newTypeOpen = useDesign((s) => s.newTypeOpen);
  useFollowProject();
  const shown = useDesign((s) => s.draft?.id);
  useEffect(() => {
    // Until a type is open the address keeps the one it asks for.
    if (shown) showTypeInAddress(shown);
  }, [shown]);
  if (!view) return <div className="loading">Loading…</div>;
  if (!host) return <div className="loading">Only the host can design components.</div>;
  return (
    <div className="designer">
      <header className="toolbar">
        <div className="title">
          <strong>{view.name}</strong>
        </div>
        <nav className="design-tabs" aria-label="Modes">
          <button
            type="button"
            className="tab"
            onClick={() => go({ project: view.project, table: view.table })}
          >
            Table
          </button>
          <button type="button" className="tab chosen" aria-pressed>
            Components
          </button>
        </nav>
        <UndoButtons />
        <SaveState />
      </header>
      <TypeList />
      <main className="design-main">
        <SamplePicker />
        <DesignCanvas />
        <YamlPane />
      </main>
      <Inspector />
      {newTypeOpen && <NewTypeDialog />}
    </div>
  );
}

/** Loads the library once, then follows changes to the project files, wherever they come from. */
function useFollowProject() {
  const version = useStore((s) => s.view?.version);
  useEffect(() => {
    const { view } = useStore.getState();
    if (version === undefined || !view) return;
    if (useDesign.getState().draft) {
      void projectChanged(view.types);
      return;
    }
    void loadLibrary().then(() => {
      const wanted = route().type;
      openType(view.types[wanted ?? ''] ?? Object.values(view.types)[0]);
    });
  }, [version]);
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Saving soon…',
  saving: 'Saving…',
  invalid: 'Not saved: fix the problems on the right',
  conflict: 'Not saved',
  failed: 'Not saved',
};

/** Whether the type is saved, and what to do when it could not be. */
function SaveState() {
  const status = useDesign((s) => s.status);
  const message = useDesign((s) => s.message);
  const file = useDesign((s) => (s.draft ? s.library?.types[s.draft.id] : undefined));
  return (
    <div className="design-status" role="status">
      <span className={`save-${status}`}>
        {STATUS_TEXT[status]}
        {status === 'saved' && file && ` to ${file}`}
      </span>
      {message && <span className="error"> {message}</span>}
      {status === 'conflict' && (
        <>
          <button type="button" onClick={() => void reloadType()}>
            Reload
          </button>
          <button type="button" onClick={() => void keepMine()}>
            Keep mine
          </button>
        </>
      )}
    </div>
  );
}
