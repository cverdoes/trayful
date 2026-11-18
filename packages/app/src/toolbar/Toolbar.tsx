import { selectionActions } from './actions';
import { Mark } from '../Mark';
import { PlayerList } from '../Players';
import { useStore } from '../store';
import { RepositoryChip } from '../repository/RepositoryChip';
import { TableMenu } from './TableMenu';
import { moreItems, selectionButtons, type ButtonProps } from './toolbarItems';
import { sendTargets, toSurface } from '../table/surfaces';
import { fitWindow } from '../table/viewport';
import { IconButton } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Menu } from '../ui/Menu';

/**
 * The bar along the top. From left to right: the table and who is at it, what
 * can be done with the selected pieces, then undo, fit, help and a menu for
 * the less frequent things.
 */
export function Toolbar() {
  const name = useStore((s) => s.view?.name);
  const status = useStore((s) => s.status);
  const host = useStore((s) => s.me?.host ?? false);
  return (
    <header className="toolbar table-toolbar">
      <div className="title">
        <Mark size={30} />
        <strong>{name ?? 'Trayful'}</strong>
        <TableMenu />
        {host && <RepositoryChip />}
        <span
          className={`status status-${status}`}
          title={`Connection: ${status}`}
          role="img"
          aria-label={`Connection: ${status}`}
        >
          {/* Online is the normal case; only say so in words when something is wrong. */}
          {status !== 'online' && status}
        </span>
        <PlayerList />
      </div>
      <SelectionButtons />
      <HistoryButtons />
      <div className="group">
        <IconButton
          icon="fit"
          label="Fit the table to the window"
          title="Fit the table to the window (0)"
          onClick={fitWindow}
        />
        <IconButton
          icon="help"
          label="Help"
          title="Help (?)"
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
      <IconButton
        icon="undo"
        label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={() => send({ type: 'undo' })}
      />
      <IconButton
        icon="redo"
        label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={() => send({ type: 'redo' })}
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
    <>
      <div className="group selection" role="group" aria-label="Selected pieces">
        {buttons.length ? (
          buttons.map((button) => <ToolButton key={button.keys} {...button} />)
        ) : (
          <span className="muted hint">Select a piece to see what you can do with it</span>
        )}
      </div>
      {/* Outside the scrolling row of actions, so its list is not cut off. */}
      <SendTo />
    </>
  );
}

/** On a table with surfaces: sends the selected pieces to free room on another surface. */
function SendTo() {
  const table = useStore((s) => s.table);
  const selection = useStore((s) => s.selection);
  const command = useStore((s) => s.command);
  const { ids, to } = table ? sendTargets(table, selection) : { ids: [], to: [] };
  if (to.length === 0) return null;
  return (
    <Menu
      label="Send to"
      button={{ kind: 'secondary', icon: 'move', text: 'Send to' }}
      align="start"
      items={to.map((surface) => ({
        label: surface.name,
        onSelect: () => command({ type: 'move', ids, to: toSurface(surface.id) }),
      }))}
    />
  );
}

/** The things done now and then: design, print, invite and start over. */
function MoreActions() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host ?? false);
  return (
    <Menu label="More" button={{ kind: 'icon', icon: 'more' }} items={moreItems(view, host)} />
  );
}

/** A quiet button for an action on the selection: its icon, and its name unless the icon says it. */
function ToolButton({ label, title, keys, icon, iconOnly, onClick }: Readonly<ButtonProps>) {
  const tip = [title ?? label, keys && `(${keys})`].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={iconOnly ? 'ui-icon-button' : 'ui-button ui-button-quiet'}
      title={tip}
      aria-label={title ?? label}
      disabled={!onClick}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={iconOnly ? 20 : 16} />}
      {!iconOnly && label}
    </button>
  );
}
