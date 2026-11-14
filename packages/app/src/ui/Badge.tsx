// Small labels: a badge for a count, and a chip for a name such as a file's.
import type { ReactNode } from 'react';

/** A count, in a pill. */
export function Badge({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="ui-badge">{children}</span>;
}

/** A name that stands for a thing, such as a file, in a pill. */
export function Chip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="ui-chip">{children}</span>;
}
