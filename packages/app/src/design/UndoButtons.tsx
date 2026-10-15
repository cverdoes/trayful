import { useEffect } from 'react';
import { redo, undo, useDesign } from './store';

/** What a key press asks of the designer's history, if anything. */
export function historyKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): 'undo' | 'redo' | undefined {
  if (!(e.ctrlKey || e.metaKey)) return undefined;
  const key = e.key.toLowerCase();
  if (key === 'y' || (key === 'z' && e.shiftKey)) return 'redo';
  return key === 'z' ? 'undo' : undefined;
}

/** Undo and redo for the type being edited, as buttons and as Ctrl+Z / Ctrl+Shift+Z. */
export function UndoButtons() {
  const canUndo = useDesign((s) => s.past.length > 0);
  const canRedo = useDesign((s) => s.future.length > 0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A text box undoes its own typing.
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const action = historyKey(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'undo') undo();
      else redo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="design-history">
      <button type="button" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </button>
    </div>
  );
}
