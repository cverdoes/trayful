import type { ProjectView } from '@trayful/core';
import type { Actions } from './actions';
import { go } from '../route';
import { useStore } from '../store';
import { confirm } from '../ui/dialogs';
import type { IconName } from '../ui/Icon';
import type { MenuItem } from '../ui/Menu';

/** A toolbar button: what it says, what its tooltip adds, its key, its icon, and what it does. */
export interface ButtonProps {
  label: string;
  title?: string;
  keys?: string;
  icon?: IconName;
  /** Whether the button shows only its icon; the label then names it to a screen reader. */
  iconOnly?: boolean;
  /** Without one the button is disabled. */
  onClick?: () => void;
}

/** The buttons for the actions that apply to the selection, in a fixed order. */
export function selectionButtons(actions: Actions): ButtonProps[] {
  const all: ButtonProps[] = [
    { label: 'Flip', keys: 'F', icon: 'flip', onClick: actions.flip },
    {
      label: 'Rotate left',
      keys: 'Q',
      icon: 'rotateLeft',
      iconOnly: true,
      onClick: actions.rotateLeft,
    },
    {
      label: 'Rotate right',
      keys: 'E',
      icon: 'rotateRight',
      iconOnly: true,
      onClick: actions.rotateRight,
    },
    { label: 'Draw', keys: 'D', icon: 'draw', onClick: actions.draw },
    { label: 'Shuffle', keys: 'S', icon: 'shuffle', onClick: actions.shuffle },
    {
      label: actions.layoutLabel,
      title: `${actions.layoutLabel} the pile`,
      keys: 'V',
      icon: actions.layoutLabel === 'Pile' ? 'layers' : 'fan',
      onClick: actions.layout,
    },
    { label: 'Roll', keys: 'R', icon: 'dice', onClick: actions.roll },
    { label: 'Decrease', keys: '-', icon: 'minus', iconOnly: true, onClick: actions.decrement },
    { label: 'Increase', keys: '+', icon: 'plus', iconOnly: true, onClick: actions.increment },
    {
      label: actions.lockLabel,
      keys: 'L',
      icon: actions.lockLabel === 'Lock' ? 'lock' : 'unlock',
      onClick: actions.lock,
    },
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
        icon: 'palette',
        hint: 'Design the components: types, fields and faces',
        onSelect: () => go({ ...at, design: true }),
      },
      {
        label: 'Print and play',
        icon: 'printer',
        hint: 'Every component at real size, to print',
        onSelect: () => go({ ...at, print: true }),
      },
      {
        label: 'Invite players…',
        icon: 'userPlus',
        hint: 'Invite players to this table',
        onSelect: () => useStore.setState({ inviteOpen: true }),
      },
    );
  }
  items.push({
    label: 'Start over…',
    icon: 'restart',
    hint: 'Start this table over',
    onSelect: () => void startOver(),
    separated: items.length > 0,
  });
  return items;
}

async function startOver(): Promise<void> {
  const setup = useStore.getState().view?.setup;
  const from = setup ? `, set up as "${setup}"` : '';
  const yes = await confirm({
    title: 'Start this table over?',
    text: `The table starts again from the project files${from}. You can undo this.`,
    action: 'Start over',
  });
  if (yes) useStore.getState().send({ type: 'reset' });
}
