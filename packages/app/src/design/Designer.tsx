import { useEffect, useState } from 'react';
import { go, route, showDesignPage, showTypeInAddress } from '../route';
import { useStore } from '../store';
import { migrateProject } from './api';
import { AssetsPage } from './AssetsPage';
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

/**
 * Design mode: the project's components, saved to its library files as you go,
 * and the images and colours they use.
 */
export function Designer() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const newTypeOpen = useDesign((s) => s.newTypeOpen);
  const [assets, setAssets] = useState(() => route().assets);
  useFollowProject();
  const shown = useDesign((s) => s.draft?.id);
  useEffect(() => {
    // Until a type is open the address keeps the one it asks for.
    if (shown) showTypeInAddress(shown);
  }, [shown]);
  if (!view) return <div className="loading">Loading…</div>;
  if (!host) return <div className="loading">Only the host can design components.</div>;
  if (view.legacy) return <MigrateNotice project={view.project} />;
  const page = (toAssets: boolean) => {
    showDesignPage(toAssets);
    setAssets(toAssets);
  };
  const tab = (label: string, chosen: boolean, onClick: () => void) => (
    <button
      type="button"
      className={chosen ? 'tab chosen' : 'tab'}
      aria-pressed={chosen}
      onClick={onClick}
    >
      {label}
    </button>
  );
  return (
    <div className={assets ? 'designer assets' : 'designer'}>
      <header className="toolbar">
        <div className="title">
          <strong>{view.name}</strong>
        </div>
        <nav className="design-tabs" aria-label="Modes">
          {tab('Table', false, () => go({ project: view.project, table: view.table }))}
          {tab('Components', !assets, () => page(false))}
          {tab('Assets', assets, () => page(true))}
        </nav>
        {!assets && <UndoButtons />}
        {!assets && <SaveState />}
      </header>
      {assets ? (
        <AssetsPage />
      ) : (
        <>
          <TypeList />
          <main className="design-main">
            <SamplePicker />
            <DesignCanvas />
            <YamlPane />
          </main>
          <Inspector />
        </>
      )}
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

/**
 * A project in the first file format plays as it is, but is only designed after
 * its files are rewritten in the current one.
 */
function MigrateNotice({ project }: Readonly<{ project: string }>) {
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const migrate = () => {
    setState({ busy: true });
    migrateProject(project).then(
      () => setState({ busy: false }),
      (err: unknown) =>
        setState({ busy: false, error: err instanceof Error ? err.message : String(err) }),
    );
  };
  return (
    <div className="loading migrate-notice">
      <p>
        This project was made for an earlier Trayful. It plays as it is, but its components can only
        be designed once its files are in the current format.
      </p>
      <p>
        <button type="button" disabled={state.busy} onClick={migrate}>
          Update the project files
        </button>
      </p>
      <p className="muted">
        The same as <code>trayful migrate</code>. Keep a copy, or commit the folder first, if you
        want the old files.
      </p>
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
