// A menu: a button that opens a list of actions under it. The arrow keys move
// through the list, Escape closes it, and the focus goes back to the button.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { itemAfterKey } from './menuKeys';

/** One action of a menu. */
export interface MenuItem {
  label: string;
  /** A line under the label that says what the action does. */
  description?: string;
  icon?: IconName;
  /** Whether the action removes something: it is drawn in the danger colour, apart from the rest. */
  danger?: boolean;
  disabled?: boolean;
  /** Shown on hover, such as why the action cannot be picked now. */
  hint?: string;
  onSelect: () => void;
}

/** What the menu's button looks like: the main action with words, or only an icon. */
type MenuButton =
  { kind: 'primary'; icon?: IconName; text: string } | { kind: 'icon'; icon: IconName };

/** A button that opens a list of actions. The label names the button and the list. */
export function Menu({
  label,
  button,
  items,
  align = 'end',
}: Readonly<{
  label: string;
  button: MenuButton;
  items: MenuItem[];
  /** Which edge of the button the list lines up with. */
  align?: 'start' | 'end';
}>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.map((item) => !item.disabled);
  useEffect(() => {
    // The first action takes the focus as the list opens, so the keys work at once.
    if (open) list.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') return close();
    const buttons = [...(list.current?.querySelectorAll('button') ?? [])];
    const next = itemAfterKey(e.key, buttons.indexOf(e.target as HTMLButtonElement), enabled);
    if (next === undefined) return;
    e.preventDefault();
    buttons[next]?.focus();
  };
  return (
    <div
      className="ui-menu"
      // The focus leaving the menu, by Tab or a click elsewhere, closes it.
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <button
        ref={trigger}
        type="button"
        className={button.kind === 'primary' ? 'ui-button ui-button-primary' : 'ui-icon-button'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={button.kind === 'icon' ? label : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === 'ArrowDown' && setOpen(true)}
      >
        <TriggerContent button={button} />
      </button>
      {open && (
        <div
          ref={list}
          className={`ui-menu-list ui-menu-${align}`}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          // A press on the list must not take the focus off it, or it would close before the click.
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((item) => (
            <MenuRow
              key={item.label}
              item={item}
              onSelect={() => {
                close();
                item.onSelect();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TriggerContent({ button }: Readonly<{ button: MenuButton }>): ReactNode {
  if (button.kind === 'icon') return <Icon name={button.icon} size={20} />;
  return (
    <>
      {button.icon && <Icon name={button.icon} />}
      {button.text}
      <Icon name="down" />
    </>
  );
}

function MenuRow({ item, onSelect }: Readonly<{ item: MenuItem; onSelect: () => void }>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={item.danger ? 'ui-menu-item danger' : 'ui-menu-item'}
      disabled={item.disabled}
      title={item.hint}
      onClick={onSelect}
    >
      {item.icon && <Icon name={item.icon} size={item.description ? 20 : 16} />}
      <span>
        {item.label}
        {item.description && <small>{item.description}</small>}
      </span>
    </button>
  );
}
