import { useEffect, useState } from 'react';
import { go, route, showDesignPage, showTypeInAddress, type DesignPage } from '../route';
import { useStore } from '../store';
import { migrateProject } from './api';
import { Mark } from '../Mark';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';
import { Status, type StatusTone } from '../ui/Status';
import { AssetsPage } from './assets/AssetsPage';
import { DesignCanvas } from './canvas/DesignCanvas';
import { Inspector } from './panel/Inspector';
import { NewTypeDialog } from './panel/NewTypeDialog';
import { SamplePicker } from './panel/SamplePicker';
import {
  keepMine,
  loadLibrary,
  openType,
  projectChanged,
  reloadType,
  useDesign,
  type SaveStatus,
} from './store';
import { TrayPage } from './tray/TrayPage';
import { TypeList } from './panel/TypeList';
import { UndoButtons } from './panel/UndoButtons';
import { YamlPane } from './panel/YamlPane';

/**
 * Design mode: the project's components, saved to its library files as you go,
 * and the images and colours they use.
 */
export function Designer() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const newTypeOpen = useDesign((s) => s.newTypeOpen);
  const [page, setPage] = useState(() => route().page);
  useFollowProject();
  const shown = useDesign((s) => s.draft?.id);
  useEffect(() => {
    // Until a type is open the address keeps the one it asks for.
    if (shown) showTypeInAddress(shown);
  }, [shown]);
  if (!view) return <div className="loading">Loading…</div>;
  if (!host) return <div className="loading">Only the host can design components.</div>;
  if (view.legacy) return <MigrateNotice project={view.project} />;
  const show = (to: DesignPage) => {
    showDesignPage(to);
    setPage(to);
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
    <div className={`designer ${page}`}>
      <header className="toolbar">
        <div className="title">
          <Mark size={30} />
          <strong>{view.name}</strong>
        </div>
        <nav className="design-tabs" aria-label="Modes">
          {tab('Table', false, () => go({ project: view.project, table: view.table }))}
          {tab('Components', page === 'components', () => show('components'))}
          {tab('Tray', page === 'tray', () => show('tray'))}
          {tab('Assets', page === 'assets', () => show('assets'))}
        </nav>
      </header>
      {page === 'assets' && <AssetsPage />}
      {page === 'tray' && (
        <>
          <TypeList />
          <TrayPage />
        </>
      )}
      {page === 'components' && (
        <>
          <TypeList />
          <main className="design-main">
            <ComponentHeader />
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

/** What the save status shows: how it reads, and a few words. */
const STATUS: Record<SaveStatus, { tone: StatusTone; text: string }> = {
  saved: { tone: 'ok', text: 'Saved' },
  unsaved: { tone: 'quiet', text: 'Saving soon…' },
  saving: { tone: 'busy', text: 'Saving…' },
  invalid: { tone: 'bad', text: 'Not saved: fix the problems on the right' },
  conflict: { tone: 'bad', text: 'Not saved' },
  failed: { tone: 'bad', text: 'Not saved' },
};

/**
 * The head of the Components page: the component shown and the file that holds it,
 * with the design that fills its faces, whether it is saved, and undo and redo.
 */
function ComponentHeader() {
  const draft = useDesign((s) => s.draft);
  const file = useDesign((s) => (s.draft ? s.library?.types[s.draft.id] : undefined));
  if (!draft) return null;
  return (
    <PageHeader title={draft.name ?? draft.id} subtitle={file && `in ${file}`}>
      <SamplePicker />
      <SaveState file={file} />
      <UndoButtons />
    </PageHeader>
  );
}

/** Whether the type is saved, and what to do when it could not be. */
function SaveState({ file }: Readonly<{ file: string | undefined }>) {
  const status = useDesign((s) => s.status);
  const message = useDesign((s) => s.message);
  return (
    <>
      <Status
        tone={STATUS[status].tone}
        title={status === 'saved' && file ? `Saved to ${file}` : undefined}
      >
        {STATUS[status].text}
        {message && <span className="error">{message}</span>}
      </Status>
      {status === 'conflict' && (
        <>
          <Button onClick={() => void reloadType()}>Reload</Button>
          <Button onClick={() => void keepMine()}>Keep mine</Button>
        </>
      )}
    </>
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
