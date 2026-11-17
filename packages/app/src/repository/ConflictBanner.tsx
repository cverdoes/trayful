import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { useRepository } from './store';

/**
 * Shown to the host while the repository and Trayful both changed the same lines.
 * The table keeps Trayful's version until the host settles it.
 */
export function ConflictBanner() {
  const conflict = useRepository((s) => s.status?.conflict);
  const busy = useRepository((s) => s.busy);
  if (!conflict) return null;
  return (
    <Notice tone="warning" className="repository-conflict">
      <strong>The repository and Trayful both changed {conflict.files.join(', ')}.</strong> The
      table shows Trayful&apos;s version, which is on the branch <code>{conflict.branch}</code>.
      Merge that branch on your computer, push and sync; or take the repository&apos;s version.
      <div className="repository-conflict-actions">
        <Button
          disabled={busy}
          onClick={() => void useRepository.getState().takeRepositoryVersion()}
        >
          Take the repository&apos;s version
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void useRepository.getState().sync()}
        >
          Sync now
        </Button>
      </div>
    </Notice>
  );
}
