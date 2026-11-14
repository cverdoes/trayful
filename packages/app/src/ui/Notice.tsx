// A notice: a few lines that tell the person something has happened, coloured by how it reads.
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** How a notice reads: news to follow, a warning to act on, or something that went wrong. */
export type NoticeTone = 'info' | 'warning' | 'error';

const ICONS: Record<NoticeTone, IconName> = { info: 'info', warning: 'alert', error: 'error' };

/**
 * A box with an icon and the message. A warning or error is announced at once to
 * a screen reader, news when the reader is free. The view places it with `className`.
 */
export function Notice({
  tone,
  className,
  children,
}: Readonly<{ tone: NoticeTone; className?: string; children: ReactNode }>) {
  return (
    <div
      className={['ui-notice', `ui-notice-${tone}`, className].filter(Boolean).join(' ')}
      role={tone === 'info' ? 'status' : 'alert'}
    >
      <Icon name={ICONS[tone]} size={20} />
      <div className="ui-notice-body">{children}</div>
    </div>
  );
}
