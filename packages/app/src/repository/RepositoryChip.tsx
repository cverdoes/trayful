import { useEffect } from 'react';
import { Menu, type MenuItem } from '../ui/Menu';
import { summary, tone, useRepository } from './store';

/** How often the chip asks where things stand, as Trayful also syncs by itself. */
const POLL_MS = 20_000;

/**
 * For the host of a git-backed Trayful: the branch it works on, coloured by how it
 * stands, with a menu to sync now or settle a conflict. Nothing for a folder.
 */
export function RepositoryChip() {
  const status = useRepository((s) => s.status);
  const busy = useRepository((s) => s.busy);
  const error = useRepository((s) => s.error);
  usePolling();
  if (!status?.connected) return null;
  const state = busy ? 'Syncing…' : summary(status);
  const items: MenuItem[] = [
    {
      label: busy ? 'Syncing…' : 'Sync now',
      icon: 'restart',
      description: 'Commit what changed here, take in new commits and push',
      disabled: busy,
      onSelect: () => void useRepository.getState().sync(),
    },
  ];
  if (status.conflict) {
    items.push({
      label: "Take the repository's version",
      description: `Trayful's changes stay on ${status.conflict.branch}`,
      danger: true,
      separated: true,
      disabled: busy,
      onSelect: () => void useRepository.getState().takeRepositoryVersion(),
    });
  }
  const where = [status.url, status.path].filter(Boolean).join(', folder ');
  return (
    <span
      className={`repository-chip repository-${busy ? 'pending' : tone(status)}`}
      title={`${where}\n${state}${error ? `\n${error}` : ''}`}
    >
      <Menu
        label={`Repository: ${status.branch ?? ''}, ${state}`}
        button={{ kind: 'secondary', icon: 'branch', text: status.branch ?? '' }}
        align="start"
        items={items}
      />
    </span>
  );
}

function usePolling(): void {
  useEffect(() => {
    const { refresh } = useRepository.getState();
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, []);
}
