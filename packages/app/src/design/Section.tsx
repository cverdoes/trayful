import type { ReactNode } from 'react';
import { isFolded, setFolded, useDesign } from './store';

/**
 * One part of the inspector under its heading, which folds it away when
 * clicked (or with Enter or Space). A folded part stays folded while the page
 * is open, from one component to the next.
 */
export function Section({
  title,
  folded = false,
  children,
}: Readonly<{ title: string; folded?: boolean; children: ReactNode }>) {
  const open = !useDesign((s) => isFolded(s.folded, title, folded));
  return (
    <section className="design-section" aria-label={title}>
      <details
        open={open}
        onToggle={(event) => {
          const now = event.currentTarget.open;
          // Also fires when `open` is set from the store; only a person's click changes it.
          if (now !== open) setFolded(title, !now);
        }}
      >
        <summary>
          <h3>{title}</h3>
        </summary>
        {children}
      </details>
    </section>
  );
}
