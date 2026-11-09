import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

/** One choice in the menu. */
export interface MenuItem {
  label: string;
  /** Says more about the choice when the label is short. */
  title?: string;
  onSelect: () => void;
  /** Draws a line above the item, to set it apart from the ones before. */
  separated?: boolean;
}

/** The button that opens a menu, when it is not the toolbar's "More". */
export interface MenuButton {
  /** What the button shows. */
  text: string;
  /** What the button and its menu are called. */
  label: string;
  title: string;
  /** Opens the menu from the button's left edge instead of its right. */
  fromLeft?: boolean;
}

const MORE: MenuButton = {
  text: 'More ▾',
  label: 'More',
  title: 'More things to do with this table',
};

/**
 * A button ("More" on the toolbar) that opens a list of the less frequent
 * choices, so they stay out of the way. Closes on a choice, Escape or a click
 * anywhere else; the arrow keys move between the choices.
 */
export function MoreMenu({
  items,
  button = MORE,
}: Readonly<{ items: MenuItem[]; button?: MenuButton }>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useCloseOnOutsideClick(open, root, setOpen);
  useEffect(() => {
    if (open) menuItems(root.current)[0]?.focus();
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('.more-button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      moveFocus(root.current, e.key === 'ArrowDown' ? 1 : -1);
    } else return;
    e.preventDefault();
    // Keep the key from the table's shortcuts too: Escape there clears the selection.
    e.stopPropagation();
  };

  return (
    <div className="more" ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="more-button"
        aria-label={button.label}
        title={button.title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {button.text}
      </button>
      {open && (
        <div
          className={button.fromLeft ? 'more-menu from-left' : 'more-menu'}
          role="menu"
          aria-label={button.label}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.separated ? 'separated' : undefined}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useCloseOnOutsideClick(
  open: boolean,
  root: RefObject<HTMLDivElement | null>,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, root, setOpen]);
}

function menuItems(root: HTMLElement | null): HTMLButtonElement[] {
  return [...(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
}

function moveFocus(root: HTMLElement | null, step: 1 | -1) {
  const items = menuItems(root);
  const at = items.indexOf(document.activeElement as HTMLButtonElement);
  items[nextChoice(at, step, items.length)]?.focus();
}

/**
 * The choice an arrow key moves to from choice `at`, wrapping around at the
 * ends. From outside the list (at -1, on the More button) Down goes to the
 * first choice and Up to the last.
 */
export function nextChoice(at: number, step: 1 | -1, count: number): number {
  const from = at < 0 && step < 0 ? 0 : at;
  return (from + step + count) % count;
}
