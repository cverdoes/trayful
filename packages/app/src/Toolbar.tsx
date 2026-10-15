import { selectionActions } from './actions';
import { PlayerList } from './Players';
import { go } from './route';
import { useStore } from './store';
import { TableMenu } from './TableMenu';
import { fitWindow } from './viewport';

const STATUS_ICON = { online: '●', connecting: '◌', offline: '○' } as const;

/** The bar along the top: the table, the players, and what can be done. */
export function Toolbar() {
  const name = useStore((s) => s.view?.name);
  const status = useStore((s) => s.status);
  return (
    <header className="toolbar">
      <div className="title">
        <strong>{name ?? 'Trayful'}</strong>
        <TableMenu />
        <span className={`status status-${status}`} title={`Connection: ${status}`}>
          {STATUS_ICON[status]} {status}
        </span>
        <PlayerList />
      </div>
      <HistoryButtons />
      <SelectionButtons />
      <TableButtons />
    </header>
  );
}

function HistoryButtons() {
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const send = useStore((s) => s.send);
  return (
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
  );
}

/** What can be done with the selected objects. */
function SelectionButtons() {
  // Re-render when the table or selection changes, since they decide which actions apply.
  useStore((s) => s.table);
  useStore((s) => s.selection);
  const actions = selectionActions();
  return (
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
      <Button label={actions.lockLabel} keys="L" onClick={actions.lock} />
    </div>
  );
}

function TableButtons() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  return (
    <div className="group">
      <Button label="Fit" keys="0" onClick={fitWindow} />
      <Button label="Start over" title="Start this table over" onClick={startOver} />
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
          label="Design"
          title="Design the components: types, fields and faces"
          onClick={
            view ? () => go({ project: view.project, table: view.table, design: true }) : undefined
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
  );
}

function startOver() {
  const setup = useStore.getState().view?.setup;
  const from = setup ? ` set up as "${setup}"` : '';
  if (window.confirm(`Start this table over from the project files${from}? You can undo this.`)) {
    useStore.getState().send({ type: 'reset' });
  }
}

function Button({
  label,
  title,
  keys,
  onClick,
}: Readonly<{
  label: string;
  title?: string;
  keys?: string;
  onClick?: () => void;
}>) {
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
