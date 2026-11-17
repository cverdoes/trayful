// The repository of a git-backed Trayful as the host's page sees it, kept fresh by polling.
import { create } from 'zustand';
import { fetchStatus, syncRepository, takeRepositoryVersion, type RepositoryStatus } from './api';

interface RepositoryStore {
  /** Undefined until loaded, and for a Trayful that works on a folder. */
  status?: RepositoryStatus;
  /** A sync or a resolve is under way. */
  busy: boolean;
  /** Why the last thing the host asked for failed. */
  error?: string;
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
  takeRepositoryVersion: () => Promise<void>;
}

export const useRepository = create<RepositoryStore>()((set) => {
  const act = async (action: () => Promise<RepositoryStatus>) => {
    set({ busy: true, error: undefined });
    try {
      set({ status: await action() });
    } catch (err) {
      set({ error: (err as Error).message });
    } finally {
      set({ busy: false });
    }
  };
  return {
    busy: false,
    refresh: async () => {
      try {
        set({ status: await fetchStatus() });
      } catch {
        // Offline for a moment: keep what was shown.
      }
    },
    sync: () => act(syncRepository),
    takeRepositoryVersion: () => act(takeRepositoryVersion),
  };
});

/** The state in a few words, such as "In sync" or "2 commits not pushed". */
export function summary(status: RepositoryStatus): string {
  if (status.conflict) return 'Conflict with the repository';
  if (status.lastError) return 'The last sync failed';
  const parts = [
    status.changed.length ? plural(status.changed.length, 'change') + ' not committed' : '',
    status.unpushed ? plural(status.unpushed, 'commit') + ' not pushed' : '',
    status.behind ? plural(status.behind, 'commit') + ' to take in' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'In sync';
}

/** How the chip is coloured: fine, waiting to sync, or needing the host. */
export function tone(status: RepositoryStatus): 'synced' | 'pending' | 'trouble' {
  if (status.conflict || status.lastError) return 'trouble';
  return status.changed.length || status.unpushed || status.behind ? 'pending' : 'synced';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
