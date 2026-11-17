import { useState, type SubmitEvent } from 'react';
import { connect } from '../connection';
import { Mark } from '../Mark';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { connectRepository } from './api';

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
  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await connectRepository({ url: url.trim(), branch: branch.trim(), path: folder.trim() });
      useStore.setState({ gate: undefined });
      connect();
    } catch (err) {
      setError((err as Error).message);
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
        <Field label="Repository" hint="Its https:// address, or an SSH address">
          <input
            type="text"
            autoFocus
            placeholder="https://github.com/me/my-game"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Branch" hint="Made from the default branch if it is new">
          <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} />
        </Field>
        <Field
          label="Folder"
          hint="Where the prototype is, such as prototype; empty for the top. A folder without one gets a new project."
        >
          <input
            type="text"
            placeholder="prototype"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          />
        </Field>
        {error && <p className="error">{error}</p>}
        <div className="gate-actions">
          <Button variant="primary" submit disabled={busy || !url.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      </form>
    </div>
  );
}
