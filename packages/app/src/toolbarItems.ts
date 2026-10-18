import type { ProjectView } from '@trayful/core';
import type { Actions } from './actions';
import type { MenuItem } from './MoreMenu';
import { go } from './route';
import { useStore } from './store';

/** A toolbar button: what it says, what its tooltip adds, its key, and what it does. */
export interface ButtonProps {
  label: string;
  title?: string;
  keys?: string;
  /** Without one the button is disabled. */
  onClick?: () => void;
}

/** The buttons for the actions that apply to the selection, in a fixed order. */
export function selectionButtons(actions: Actions): ButtonProps[] {
  const all: ButtonProps[] = [
    { label: 'Flip', keys: 'F', onClick: actions.flip },
    { label: '⟲', title: 'Rotate left', keys: 'Q', onClick: actions.rotateLeft },
    { label: '⟳', title: 'Rotate right', keys: 'E', onClick: actions.rotateRight },
    { label: 'Draw', keys: 'D', onClick: actions.draw },
    { label: 'Shuffle', keys: 'S', onClick: actions.shuffle },
    {
      label: actions.layoutLabel,
      title: `${actions.layoutLabel} the pile`,
      keys: 'V',
      onClick: actions.layout,
    },
    { label: 'Roll', keys: 'R', onClick: actions.roll },
    { label: '−', title: 'Decrease', keys: '-', onClick: actions.decrement },
    { label: '+', title: 'Increase', keys: '+', onClick: actions.increment },
    { label: actions.lockLabel, keys: 'L', onClick: actions.lock },
  ];
  return all.filter((button) => button.onClick);
}

/** The things done now and then, for the More menu. Only the host designs, prints and invites. */
export function moreItems(view: ProjectView | undefined, host: boolean): MenuItem[] {
  const items: MenuItem[] = [];
  if (host && view) {
    const at = { project: view.project, table: view.table };
    items.push(
      {
        label: 'Design components',
        title: 'Design the components: types, fields and faces',
        onSelect: () => go({ ...at, design: true }),
      },
      {
        label: 'Print and play',
        title: 'Every component at real size, to print',
        onSelect: () => go({ ...at, print: true }),
      },
      {
        label: 'Invite players…',
        title: 'Invite players to this table',
        onSelect: () => useStore.setState({ inviteOpen: true }),
      },
    );
  }
  items.push({
    label: 'Start over…',
    title: 'Start this table over',
    onSelect: startOver,
    separated: items.length > 0,
  });
  return items;
}

function startOver() {
  const setup = useStore.getState().view?.setup;
  const from = setup ? ` set up as "${setup}"` : '';
  if (window.confirm(`Start this table over from the project files${from}? You can undo this.`)) {
    useStore.getState().send({ type: 'reset' });
  }
}
