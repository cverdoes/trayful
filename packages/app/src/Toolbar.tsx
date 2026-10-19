import { selectionActions } from './actions';
import { Mark } from './Mark';
import { PlayerList } from './Players';
import { MoreMenu } from './MoreMenu';
import { useStore } from './store';
import { TableMenu } from './TableMenu';
import { moreItems, selectionButtons, type ButtonProps } from './toolbarItems';
import { fitWindow } from './viewport';

const STATUS_ICON = { online: '●', connecting: '◌', offline: '○' } as const;

/**
 * The bar along the top. From left to right: the table and who is at it, what
 * can be done with the selected pieces, then undo, fit, help and a menu for
 * the less frequent things.
 */
export function Toolbar() {
  const name = useStore((s) => s.view?.name);
  const status = useStore((s) => s.status);
  return (
    <header className="toolbar table-toolbar">
      <div className="title">
        <Mark size={30} />
        <strong>{name ?? 'Trayful'}</strong>
        <TableMenu />
        <span
          className={`status status-${status}`}
          title={`Connection: ${status}`}
          role="img"
          aria-label={`Connection: ${status}`}
        >
          {STATUS_ICON[status]}
          {/* Online is the normal case; only say so in words when something is wrong. */}
          {status !== 'online' && ` ${status}`}
        </span>
        <PlayerList />
      </div>
      <SelectionButtons />
      <HistoryButtons />
      <div className="group">
        <Button label="Fit" title="Fit the table to the window" keys="0" onClick={fitWindow} />
        <Button
          label="?"
          title="Help"
          keys="?"
          onClick={() => useStore.setState({ helpOpen: true })}
        />
        <MoreActions />
      </div>
    </header>
  );
}

function HistoryButtons() {
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const send = useStore((s) => s.send);
  return (
    <div className="group history">
      <Button
        label="↶"
        title="Undo"
        keys="Ctrl+Z"
        onClick={canUndo ? () => send({ type: 'undo' }) : undefined}
      />
      <Button
        label="↷"
        title="Redo"
        keys="Ctrl+Shift+Z"
        onClick={canRedo ? () => send({ type: 'redo' }) : undefined}
      />
    </div>
  );
}

/**
 * What can be done with the selected objects. Only the actions that apply are
 * shown, so the bar stays short; the help lists all of them with their keys.
 */
function SelectionButtons() {
  // Re-render when the table or selection changes, since they decide which actions apply.
  useStore((s) => s.table);
  useStore((s) => s.selection);
  const buttons = selectionButtons(selectionActions());
  return (
    <div className="group selection" role="group" aria-label="Selected pieces">
      {buttons.length ? (
        buttons.map((button) => <Button key={button.keys} {...button} />)
      ) : (
        <span className="muted hint">Select a piece to see what you can do with it</span>
      )}
    </div>
  );
}

/** The things done now and then: design, print, invite and start over. */
function MoreActions() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host ?? false);
  return <MoreMenu items={moreItems(view, host)} />;
}

function Button({ label, title, keys, onClick }: Readonly<ButtonProps>) {
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
