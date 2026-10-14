import { useEffect, useState } from 'react';
import { selectionActions } from './actions';
import { ClosedScreen, HandTray, InviteDialog, JoinScreen, PlayerList } from './Players';
import { Print } from './Print';
import { RenderJob } from './render/Preview';
import { go, route } from './route';
import { useStore } from './store';
import { Table } from './Table';
import { fitToTable, HAND_HEIGHT, tableBounds, TOOLBAR_HEIGHT, zoomAt } from './viewport';

export function App() {
  useTestHook();
  const fatal = useStore((s) => s.fatal);
  const gate = useStore((s) => s.gate);
  if (fatal) return <div className="loading">{fatal}</div>;
  if (gate === 'closed') return <ClosedScreen />;
  if (gate === 'join') return <JoinScreen />;
  return route().print ? <Print /> : <TableApp />;
}

function TableApp() {
  useKeyboard();
  const helpOpen = useStore((s) => s.helpOpen);
  const inviteOpen = useStore((s) => s.inviteOpen);
  return (
    <>
      <Table />
      <Toolbar />
      <HandTray />
      {inviteOpen && <InviteDialog />}
      <Problems />
      <ErrorToast />
      <Activity />
      <RenderJob />
      {helpOpen && <Help />}
    </>
  );
}

/** Shown while the project files have errors; the table keeps the last good version. */
function Problems() {
  const problems = useStore((s) => s.problems);
  if (!problems?.length) return null;
  return (
    <div className="problems" role="alert">
      <strong>The project files have errors.</strong> The table shows the last version that loaded;
      fix the files and save to update it.
      <pre>{problems.join('\n')}</pre>
    </div>
  );
}

interface ProjectSummary {
  id: string;
  name: string;
  problems: string[];
  tables: string[];
}

const NEW = '\u0000new';
const DUPLICATE = '\u0000duplicate';
const DELETE = '\u0000delete';

async function api(method: string, url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? response.statusText);
  return result;
}

function suggestName(tables: string[]): string {
  let n = tables.length + 1;
  while (tables.includes(`table-${n}`)) n++;
  return `table-${n}`;
}

/** Switches between the tables (and projects) of the workspace, and makes new ones. */
function TableMenu() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const refresh = () =>
    void fetch('/api/projects')
      .then((r) => r.json())
      .then((p: ProjectSummary[]) => setProjects(p));
  useEffect(refresh, []);
  if (!view) return null;
  const current = `${view.project}/${view.table}`;
  const tables = projects.find((p) => p.id === view.project)?.tables ?? [view.table];
  const fail = (err: unknown) =>
    useStore.setState({ error: { message: (err as Error).message, at: Date.now() } });

  const onChange = async (value: string) => {
    try {
      if (value === NEW || value === DUPLICATE) {
        const name = window.prompt(
          value === NEW ? 'Name for the new table:' : `Name for the copy of ${view.table}:`,
          suggestName(tables),
        );
        if (!name) return;
        await api('POST', '/api/tables', {
          project: view.project,
          name,
          ...(value === DUPLICATE ? { from: view.table } : {}),
        });
        go({ project: view.project, table: name });
      } else if (value === DELETE) {
        if (!window.confirm(`Delete table "${view.table}" for good? This cannot be undone.`))
          return;
        const next = tables.find((t) => t !== view.table);
        await api(
          'DELETE',
          `/api/tables?project=${encodeURIComponent(view.project)}&name=${encodeURIComponent(view.table)}`,
        );
        go({ project: view.project, table: next });
      } else {
        const [project, table] = value.split('/');
        go({ project: project!, table });
      }
    } catch (err) {
      fail(err);
      refresh();
    }
  };

  return (
    <select
      aria-label="Table"
      value={current}
      onFocus={refresh}
      onChange={(e) => void onChange(e.target.value)}
    >
      {(projects.length
        ? projects
        : [{ id: view.project, name: view.name, problems: [], tables }]
      ).map((p) => (
        <optgroup key={p.id} label={p.problems.length ? `${p.name} (has errors)` : p.name}>
          {(p.id === view.project && !p.tables.includes(view.table)
            ? [...p.tables, view.table]
            : p.tables.length
              ? p.tables
              : ['table-1']
          ).map((t) => (
            <option
              key={t}
              value={`${p.id}/${t}`}
              disabled={p.problems.length > 0 && p.id !== view.project}
            >
              {t}
            </option>
          ))}
        </optgroup>
      ))}
      {host && (
        <optgroup label="This table">
          <option value={NEW}>New table…</option>
          <option value={DUPLICATE}>Duplicate this table…</option>
          <option value={DELETE}>Delete this table…</option>
        </optgroup>
      )}
    </select>
  );
}

function fit() {
  const { table, view } = useStore.getState();
  if (table && view) fitToTable(table, view.types, window.innerWidth, window.innerHeight);
}

/** Zooms out when an agent puts something where the people watching cannot see it. */
function keepTableInView() {
  const { table, view, viewport: v } = useStore.getState();
  const box = table && view && tableBounds(table, view.types);
  if (!box) return;
  const [x0, y0, x1, y1] = box;
  const outside =
    v.x + x0 * v.scale < 0 ||
    v.y + y0 * v.scale < TOOLBAR_HEIGHT ||
    v.x + x1 * v.scale > window.innerWidth ||
    v.y + y1 * v.scale > window.innerHeight - HAND_HEIGHT;
  if (outside) fit();
}

function zoom(factor: number) {
  zoomAt({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, factor);
}

function newTable() {
  const setup = useStore.getState().view?.setup;
  const from = setup ? ` set up as "${setup}"` : '';
  if (window.confirm(`Start this table over from the project files${from}? You can undo this.`)) {
    useStore.getState().send({ type: 'reset' });
  }
}

function Toolbar() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const status = useStore((s) => s.status);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const send = useStore((s) => s.send);
  // Re-render when the table or selection changes, since they decide which actions apply.
  useStore((s) => s.table);
  const selection = useStore((s) => s.selection);
  const actions = selectionActions();

  return (
    <header className="toolbar">
      <div className="title">
        <strong>{view?.name ?? 'Trayful'}</strong>
        <TableMenu />
        <span className={`status status-${status}`} title={`Connection: ${status}`}>
          {status === 'online' ? '●' : status === 'connecting' ? '◌' : '○'} {status}
        </span>
        <PlayerList />
      </div>
      <div className="group">
        <Button
          label="Undo"
          keys="Ctrl+Z"
          onClick={canUndo ? () => send({ type: 'undo' }) : undefined}
        />
        <Button
          label="Redo"
          keys="Ctrl+Shift+Z"
          onClick={canRedo ? () => send({ type: 'redo' }) : undefined}
        />
      </div>
      <div className="group">
        <Button label="Flip" keys="F" onClick={actions.flip} />
        <Button label="⟲" title="Rotate left" keys="Q" onClick={actions.rotateLeft} />
        <Button label="⟳" title="Rotate right" keys="E" onClick={actions.rotateRight} />
        <Button label="Draw" keys="D" onClick={actions.draw} />
        <Button label="Shuffle" keys="S" onClick={actions.shuffle} />
        <Button
          label={actions.layoutLabel}
          title={`${actions.layoutLabel} the pile`}
          keys="V"
          onClick={actions.layout}
        />
        <Button label="Roll" keys="R" onClick={actions.roll} />
        <Button label="−" title="Decrease" keys="-" onClick={actions.decrement} />
        <Button label="+" title="Increase" keys="+" onClick={actions.increment} />
        <Button
          label={actions.lockLabel}
          keys="L"
          onClick={selection.length ? actions.lock : undefined}
        />
      </div>
      <div className="group">
        <Button label="Fit" keys="0" onClick={fit} />
        <Button label="Start over" title="Start this table over" onClick={newTable} />
        {host && (
          <Button
            label="Print"
            title="Print and play: every component at real size"
            onClick={
              view ? () => go({ project: view.project, table: view.table, print: true }) : undefined
            }
          />
        )}
        {host && (
          <Button
            label="Invite"
            title="Invite players to this table"
            onClick={() => useStore.setState({ inviteOpen: true })}
          />
        )}
        <Button
          label="?"
          title="Help"
          keys="?"
          onClick={() => useStore.setState({ helpOpen: true })}
        />
      </div>
    </header>
  );
}

function Button({
  label,
  title,
  keys,
  onClick,
}: {
  label: string;
  title?: string;
  keys?: string;
  onClick?: () => void;
}) {
  const tip = [title ?? label, keys && `(${keys})`].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      title={tip}
      aria-label={title ?? label}
      disabled={!onClick}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** Says what an agent or another player just did, so everyone can follow along. */
function Activity() {
  const activity = useStore((s) => s.activity);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!activity) return;
    setVisible(true);
    if (activity.agent) keepTableInView();
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [activity]);
  if (!activity || !visible) return null;
  return (
    <div className="activity" role="status">
      <strong>{activity.name}</strong> {activity.text}
    </div>
  );
}

function ErrorToast() {
  const error = useStore((s) => s.error);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!error) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [error]);
  if (!error || !visible) return null;
  return (
    <div className="toast" role="alert">
      {error.message}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Drag', 'Move a piece, or take the top card off a pile'],
  ['Drag onto a pile', 'Put cards or tiles on top of it'],
  ['Drag near a board spot', 'Snap into it; pieces on a board move with the board'],
  ['Drag a card in a fan or spread', 'Take that card out of the pile'],
  ['Shift + drag a pile', 'Move the whole pile'],
  ['Click / Shift + click', 'Select / add to the selection'],
  ['Shift + drag on the table', 'Select everything in a box'],
  ['Drag on the table', 'Pan'],
  ['Wheel', 'Zoom (over a counter: change its number)'],
  ['Double-click', 'Flip a card, or roll a die'],
  ['Drag onto your hand', 'Keep cards hidden from the other players, along the bottom'],
  ['Drag out of your hand', 'Play a card face up; hold Alt to play it face down'],
  ['Double-click in your hand', 'Play that card into the middle of the view'],
  ['F', 'Flip'],
  ['Q / E', 'Rotate left / right'],
  ['D', 'Draw the top card of the selected pile'],
  ['S', 'Shuffle the selected pile'],
  ['V', 'Show the selected pile as a pile, a fan or spread out'],
  ['R', 'Roll the selected dice'],
  ['+ / −', 'Change the selected counters'],
  ['L', 'Lock or unlock'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo your own last move'],
  ['0', 'Fit the table to the window'],
  ['Esc', 'Clear the selection'],
];

function Help() {
  const close = () => useStore.setState({ helpOpen: false });
  return (
    <div className="overlay" onClick={close}>
      <div className="help" role="dialog" aria-label="Help" onClick={(e) => e.stopPropagation()}>
        <h2>Playing on the table</h2>
        <table>
          <tbody>
            {SHORTCUTS.map(([keys, what]) => (
              <tr key={keys}>
                <th>{keys}</th>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          Every change is saved to the project&apos;s <code>tables/</code> folder as you play.
        </p>
        <button type="button" onClick={close}>
          Close
        </button>
      </div>
    </div>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useStore.setState({ shiftDown: e.type === 'keydown' });
      if (e.type !== 'keydown') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const state = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        state.send({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && key === 'y') {
        state.send({ type: 'redo' });
      } else if (mod || e.altKey) {
        return;
      } else if (e.key === 'Escape') {
        if (state.helpOpen) useStore.setState({ helpOpen: false });
        else state.select([]);
      } else if (e.key === '?') {
        useStore.setState({ helpOpen: !state.helpOpen });
      } else if (e.key === '0') {
        fit();
      } else {
        const actions = selectionActions();
        const action = {
          f: actions.flip,
          q: actions.rotateLeft,
          e: actions.rotateRight,
          s: actions.shuffle,
          v: actions.layout,
          r: actions.roll,
          d: actions.draw,
          l: state.selection.length ? actions.lock : undefined,
          '+': actions.increment ?? (() => zoom(1.25)),
          '=': actions.increment ?? (() => zoom(1.25)),
          '-': actions.decrement ?? (() => zoom(0.8)),
        }[key];
        if (!action) return;
        action();
      }
      e.preventDefault();
    };
    const onBlur = () => useStore.setState({ shiftDown: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

declare global {
  interface Window {
    /** Lets end-to-end tests read state and find pieces on screen. */
    __trayful?: {
      store: typeof useStore;
      worldToScreen: (x: number, y: number) => { x: number; y: number };
    };
  }
}

function useTestHook() {
  useEffect(() => {
    window.__trayful = {
      store: useStore,
      worldToScreen: (x, y) => {
        const { viewport: v } = useStore.getState();
        return { x: v.x + x * v.scale, y: v.y + y * v.scale };
      },
    };
  }, []);
}
