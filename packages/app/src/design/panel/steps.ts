// Undo and redo for something edited in the designer: the versions before the
// current one, and those undone. Pure, so the type designer and the Tray share it.

/** Earlier versions, and versions undone, newest last. */
export interface Steps<T> {
  past: T[];
  future: T[];
}

export function noSteps<T>(): Steps<T> {
  return { past: [], future: [] };
}

/**
 * The steps after a change from `before`. With `merge`, the change joins the one
 * just before it, so typing a word is one step. A change drops what could be redone.
 */
export function stepped<T>(steps: Steps<T>, before: T, merge: boolean): Steps<T> {
  const past = merge && steps.past.length > 0 ? steps.past : [...steps.past, before];
  return { past, future: [] };
}

/** The version before `current`, and the steps after going back to it; undefined when there is none. */
export function undone<T>(steps: Steps<T>, current: T): { value: T; steps: Steps<T> } | undefined {
  const value = steps.past.at(-1);
  if (value === undefined) return undefined;
  return { value, steps: { past: steps.past.slice(0, -1), future: [...steps.future, current] } };
}

/** The version last undone, and the steps after putting it back; undefined when there is none. */
export function redone<T>(steps: Steps<T>, current: T): { value: T; steps: Steps<T> } | undefined {
  const value = steps.future.at(-1);
  if (value === undefined) return undefined;
  return { value, steps: { past: [...steps.past, current], future: steps.future.slice(0, -1) } };
}
