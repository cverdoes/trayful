// The head of a page: what the page is about on the left, and what can be done with it on the right.
import type { ReactNode } from 'react';

/** A page's title with a quiet line under it, and the page's status and actions beside them. */
export function PageHeader({
  title,
  subtitle,
  children,
}: Readonly<{ title: string; subtitle?: ReactNode; children?: ReactNode }>) {
  return (
    <header className="ui-header">
      <div className="ui-header-title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
