// A field of a form: a label above a box, and a hint under it when there is one.
import type { ReactNode } from 'react';

/** A labelled box. The box is the child: a text box, a number box or a drop-down. */
export function Field({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </label>
  );
}
