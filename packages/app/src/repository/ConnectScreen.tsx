import { useState, type SubmitEvent } from 'react';
import { connect } from '../connection';
import { Mark } from '../Mark';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../ui/Notice';
import { connectRepository, RepositoryError, type Fresh } from './api';

/**
 * For the host of a git-backed Trayful that has no project yet: which repository,
 * branch and folder to work on. Trayful clones it and opens the table.
 */
export function ConnectScreen() {
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // A new branch or project to confirm, so a typo does not quietly make one.
  const [fresh, setFresh] = useState<Fresh>();
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setFresh(undefined);
  };
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await connectRepository({
        url: url.trim(),
        branch: branch.trim(),
        path: folder.trim(),
        create: fresh !== undefined,
      });
      useStore.setState({ gate: undefined });
      connect();
    } catch (err) {
      if (err instanceof RepositoryError && err.fresh) setFresh(err.fresh);
      else setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="overlay gate">
      <form className="gate-card" onSubmit={(e) => void submit(e)}>
        <Mark size={96} />
        <h2>Connect a repository</h2>
        <p>
          Trayful keeps a copy of your game&apos;s repository here. It commits what changes on the
          table and pushes it, and takes in what you push.
        </p>
        <Field
          label="Repository"
          hint="Its https:// address. A private one needs Trayful started with TRAYFUL_GIT_TOKEN."
        >
          <input
            type="text"
            autoFocus
            placeholder="https://github.com/me/my-game"
            value={url}
            onChange={(e) => edit(setUrl)(e.target.value)}
          />
        </Field>
        <Field label="Branch" hint="Trayful asks before making a new one">
          <input type="text" value={branch} onChange={(e) => edit(setBranch)(e.target.value)} />
        </Field>
        <Field
          label="Folder"
          hint="Where the prototype is, such as prototype; empty for the top. Trayful asks before starting a new project."
        >
          <input
            type="text"
            placeholder="prototype"
            value={folder}
            onChange={(e) => edit(setFolder)(e.target.value)}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        {fresh && <FreshNote fresh={fresh} />}
        <ConnectActions
          busy={busy}
          ready={url.trim() !== ''}
          fresh={fresh}
          back={() => setFresh(undefined)}
        />
      </form>
    </div>
  );
}

function connectLabel(busy: boolean, fresh: Fresh | undefined): string {
  if (busy) return 'Connecting…';
  return fresh ? 'Create and connect' : 'Connect';
}

/** Connect, or with something new to confirm: create and connect, or go back. */
function ConnectActions({
  busy,
  ready,
  fresh,
  back,
}: Readonly<{ busy: boolean; ready: boolean; fresh: Fresh | undefined; back: () => void }>) {
  return (
    <div className="gate-actions">
      {fresh && (
        <Button onClick={back} disabled={busy}>
          Go back
        </Button>
      )}
      <Button variant="primary" submit disabled={busy || !ready}>
        {connectLabel(busy, fresh)}
      </Button>
    </div>
  );
}

/** What connecting would make, to check it is meant and not a typo. */
function FreshNote({ fresh }: Readonly<{ fresh: Fresh }>) {
  return (
    <Notice tone="warning">
      {fresh.branch !== undefined && (
        <p>
          The repository has no branch <strong>{fresh.branch}</strong> yet. Trayful will make it
          from the default branch.
        </p>
      )}
      {fresh.folder !== undefined && (
        <p>
          There is no Trayful project in{' '}
          {fresh.folder ? <strong>{fresh.folder}</strong> : 'the top folder'} yet. Trayful will
          start one there and push it.
        </p>
      )}
      <p>Check for typos, then create, or go back and change them.</p>
    </Notice>
  );
}
