// What a page shows when it has nothing to list: an icon, what is missing, and what to do about it.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** A centred note for an empty page, with an action under it if there is one. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: Readonly<{ icon: IconName; title: string; children?: ReactNode; action?: ReactNode }>) {
  return (
    <div className="ui-empty">
      <span className="ui-empty-icon">
        <Icon name={icon} size={20} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
