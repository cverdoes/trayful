// Buttons: one with words, in four weights, and one that is only an icon.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** How much a button asks for attention: the main action, an ordinary one, a quiet one, or one that removes. */
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

type NativeProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className'>;

/** A button with words, and an icon before them if it has one. */
export function Button({
  variant = 'secondary',
  icon,
  children,
  ...rest
}: Readonly<NativeProps & { variant?: ButtonVariant; icon?: IconName; children: ReactNode }>) {
  return (
    <button type="button" className={`ui-button ui-button-${variant}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/** A button that shows only an icon. Its label names it to a screen reader and on hover. */
export function IconButton({
  icon,
  label,
  title = label,
  ...rest
}: Readonly<NativeProps & { icon: IconName; label: string }>) {
  return (
    <button type="button" className="ui-icon-button" aria-label={label} title={title} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}
