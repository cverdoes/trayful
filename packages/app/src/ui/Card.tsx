// A card: a bordered block with a header (icon, title, summary, actions) and a body.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** A card. Its label names it as a region of the page; what its title shows can be more than words. */
export function Card({
  label,
  icon,
  title,
  summary,
  actions,
  children,
}: Readonly<{
  label: string;
  icon: IconName;
  title: ReactNode;
  summary?: ReactNode;
  /** What sits at the right of the header, usually a menu. */
  actions?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <section className="ui-card" aria-label={label}>
      <header className="ui-card-header">
        <span className="ui-card-icon">
          <Icon name={icon} size={20} />
        </span>
        <div className="ui-card-heading">
          <h3>{title}</h3>
          {summary && <p>{summary}</p>}
        </div>
        {actions && <div className="ui-card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
