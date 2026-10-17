import { useEffect } from 'react';
import { selectionActions, type Actions } from './actions';
import { useStore } from './store';
import { fitWindow, zoomWindow } from './viewport';

/** The toolbar actions that have a key of their own. */
type ActionName =
  | 'flip'
  | 'rotateLeft'
  | 'rotateRight'
  | 'shuffle'
  | 'layout'
  | 'roll'
  | 'draw'
  | 'lock'
  | 'increment'
  | 'decrement';

export type Shortcut = 'undo' | 'redo' | 'escape' | 'help' | 'fit' | ActionName;

/** The parts of a key press that decide what it does. */
type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Keys pressed with Ctrl (or Cmd on a Mac). */
const WITH_CTRL = new Map<string, Shortcut>([
  ['z', 'undo'],
  ['shift+z', 'redo'],
  ['y', 'redo'],
  ['shift+y', 'redo'],
]);

/** Keys on their own. Letters work with Shift too. */
const KEYS = new Map<string, Shortcut>([
  ['escape', 'escape'],
  ['?', 'help'],
  ['0', 'fit'],
  ['f', 'flip'],
  ['q', 'rotateLeft'],
  ['e', 'rotateRight'],
  ['s', 'shuffle'],
  ['v', 'layout'],
  ['r', 'roll'],
  ['d', 'draw'],
  ['l', 'lock'],
  ['+', 'increment'],
  ['=', 'increment'],
  ['-', 'decrement'],
]);

/** Without counters selected, + and − zoom instead. */
const ZOOM: Partial<Record<ActionName, number>> = { increment: 1.25, decrement: 0.8 };

/** What a key press does, if anything. */
export function shortcutFor(press: KeyPress): Shortcut | undefined {
  const key = press.key.toLowerCase();
  if (press.ctrlKey || press.metaKey) return WITH_CTRL.get(press.shiftKey ? `shift+${key}` : key);
  return press.altKey ? undefined : KEYS.get(key);
}

/** The keyboard shortcuts of the table, and Shift for selecting and moving whole piles. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useStore.setState({ shiftDown: e.type === 'keydown' });
      if (e.type !== 'keydown') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const shortcut = shortcutFor(e);
      if (shortcut && perform(shortcut)) e.preventDefault();
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

/** Does what a shortcut says. Returns false when it does not apply to the selection. */
function perform(shortcut: Shortcut): boolean {
  const state = useStore.getState();
  switch (shortcut) {
    case 'undo':
    case 'redo':
      state.send({ type: shortcut });
      return true;
    case 'escape':
      if (state.helpOpen) useStore.setState({ helpOpen: false });
      else if (state.groupPick) useStore.setState({ groupPick: undefined });
      else state.select([]);
      return true;
    case 'help':
      useStore.setState({ helpOpen: !state.helpOpen });
      return true;
    case 'fit':
      fitWindow();
      return true;
    default: {
      const action = actionFor(selectionActions(), shortcut);
      action?.();
      return action !== undefined;
    }
  }
}

function actionFor(actions: Actions, name: ActionName): (() => void) | undefined {
  const factor = ZOOM[name];
  return actions[name] ?? (factor ? () => zoomWindow(factor) : undefined);
}
