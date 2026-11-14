// A status line: an icon and a few words that say how something stands, such as whether it is saved.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** How a status reads: all is well, work is under way, something is wrong, or nothing to remark. */
export type StatusTone = 'ok' | 'busy' | 'bad' | 'quiet';

const ICONS: Record<StatusTone, IconName> = {
  ok: 'check',
  busy: 'spinner',
  bad: 'alert',
  quiet: 'spinner',
};

/** A status, announced to screen readers when it changes. Its title says the whole of it on hover. */
export function Status({
  tone,
  title,
  children,
}: Readonly<{ tone: StatusTone; title?: string; children: ReactNode }>) {
  return (
    <div className={`ui-status ui-status-${tone}`} role="status" title={title}>
      <Icon name={ICONS[tone]} />
      {children}
    </div>
  );
}
