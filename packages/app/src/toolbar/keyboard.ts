import { useEffect } from 'react';
import { keyActions, type Actions } from './actions';
import { toggleHandTray } from './hand';
import { closeMagnifier, spaceKey } from './magnify';
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

export type Shortcut = 'undo' | 'redo' | 'escape' | 'help' | 'fit' | 'hand' | ActionName;

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
  ['h', 'hand'],
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

/**
 * The keyboard shortcuts of the table, Shift for selecting and moving whole piles,
 * and Space for magnifying the piece under the pointer.
 */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useStore.setState({ shiftDown: e.type === 'keydown' });
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        if (spaceKey(e.type === 'keydown', e.repeat, performance.now())) e.preventDefault();
        return;
      }
      if (e.type !== 'keydown') return;
      const shortcut = shortcutFor(e);
      if (shortcut && perform(shortcut)) e.preventDefault();
    };
    const onBlur = () => {
      useStore.setState({ shiftDown: false });
      // Space let go in another window would never come back up here.
      closeMagnifier();
    };
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

/** Does what a shortcut says. Returns false when it does not apply to what it would act on. */
function perform(shortcut: Shortcut): boolean {
  const state = useStore.getState();
  switch (shortcut) {
    case 'undo':
    case 'redo':
      state.send({ type: shortcut });
      return true;
    case 'escape':
      if (state.magnifier) closeMagnifier();
      else if (state.helpOpen) useStore.setState({ helpOpen: false });
      else if (state.groupPick) useStore.setState({ groupPick: undefined });
      else if (state.markPick) useStore.setState({ markPick: undefined });
      else state.select([]);
      return true;
    case 'help':
      useStore.setState({ helpOpen: !state.helpOpen });
      return true;
    case 'fit':
      fitWindow();
      return true;
    case 'hand':
      toggleHandTray();
      return true;
    default: {
      const action = actionFor(keyActions(), shortcut);
      action?.();
      return action !== undefined;
    }
  }
}

function actionFor(actions: Actions, name: ActionName): (() => void) | undefined {
  const factor = ZOOM[name];
  return actions[name] ?? (factor ? () => zoomWindow(factor) : undefined);
}
