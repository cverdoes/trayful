// A dialog: a box over the page that holds the focus until it is closed.
import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';

/** What starts with the focus: the control marked for it, else the first in the body, else the first action, else the cross. */
const FIRST_FOCUS = [
  '[data-focus]',
  '.ui-dialog-body :is(input, select, textarea, button):not(:disabled)',
  '.ui-dialog-actions button:not(:disabled)',
  '.ui-dialog-header button',
];

/**
 * A box over the page with a title, a body and a row of actions. Escape, the
 * cross and a click outside close it; while it is open nothing behind it takes
 * the focus or a click. With `onSubmit` it is a form, sent by Enter.
 */
export function Dialog({
  title,
  size = 'md',
  onClose,
  onSubmit,
  actions,
  children,
}: Readonly<{
  title: string;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  onSubmit?: () => void;
  /** The buttons along the bottom, the main one last. */
  actions?: ReactNode;
  children: ReactNode;
}>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const box = dialog.current;
    if (!box || box.open) return;
    box.showModal();
    focusFirst(box);
  }, []);
  const content = (
    <>
      <header className="ui-dialog-header">
        <h2>{title}</h2>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </header>
      <div className="ui-dialog-body">{children}</div>
      {actions && <footer className="ui-dialog-actions">{actions}</footer>}
    </>
  );
  return (
    <dialog
      ref={dialog}
      className={`ui-dialog ui-dialog-${size}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The box fills the dialog, so a click on the dialog itself is one outside the box.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Keys typed here are not shortcuts of the page behind.
      onKeyDown={(e) => e.stopPropagation()}
    >
      {onSubmit ? (
        <form
          className="ui-dialog-box"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {content}
        </form>
      ) : (
        <div className="ui-dialog-box">{content}</div>
      )}
    </dialog>
  );
}

/** Puts the focus where typing or Enter is most useful, and selects a text box's text. */
function focusFirst(box: HTMLDialogElement): void {
  for (const selector of FIRST_FOCUS) {
    const first = box.querySelector<HTMLElement>(selector);
    if (!first) continue;
    first.focus();
    if (first instanceof HTMLInputElement && first.type === 'text') first.select();
    return;
  }
}
