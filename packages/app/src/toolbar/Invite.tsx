import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { confirm } from '../ui/dialogs';
import { Field } from '../ui/Field';

interface ProjectTables {
  project: string;
  name: string;
  tables: string[];
}

/**
 * The host's invite links to one table, to send to playtesters. Starts on the table
 * open in this window; another can be picked. A link lets people into that table only.
 */
export function InviteDialog() {
  const view = useStore((s) => s.view);
  const [chosen, setChosen] = useState(view ? `${view.project}/${view.table}` : '');
  const [project, table] = chosen.split('/') as [string, string];
  const invite = useInvite(project, table);
  const close = () => useStore.setState({ inviteOpen: false });

  return (
    <Dialog
      title="Invite players"
      onClose={close}
      actions={
        !!invite.links?.length && (
          <Button onClick={invite.renew} title="Stop the current link working">
            New link
          </Button>
        )
      }
    >
      <TablePicker chosen={chosen} onChoose={setChosen} />
      {invite.error && <p className="error">{invite.error}</p>}
      {invite.links?.length === 0 && (
        <p>
          This table is only reachable from your computer. To play with others, restart with{' '}
          <code>trayful play --share</code> (same network) or <code>trayful play --tunnel</code>{' '}
          (anywhere, through Cloudflare).
        </p>
      )}
      {!!invite.links?.length && (
        <InviteLinks table={table} links={invite.links} renewed={invite.renewed} />
      )}
    </Dialog>
  );
}

/** The invite links to a table, and a way to replace them. */
function useInvite(project: string, table: string) {
  const [links, setLinks] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [renewed, setRenewed] = useState(false);
  useEffect(() => {
    if (!project || !table) return;
    setLinks(undefined);
    setRenewed(false);
    fetchInvite(project, table)
      .then(setLinks)
      .catch((err: unknown) => setError(messageOf(err)));
  }, [project, table]);

  const renew = () => {
    confirm({
      title: `Make a new link to ${table}?`,
      text: 'The old link stops working. Players who already joined keep their seat.',
      action: 'New link',
    })
      .then((yes) => (yes ? fetchInvite(project, table, true) : undefined))
      .then((l) => {
        if (!l) return;
        setLinks(l);
        setRenewed(true);
      })
      .catch((err: unknown) => setError(messageOf(err)));
  };
  return { links, error, renewed, renew };
}

/** Picks the table to invite to, from every project in the workspace. */
function TablePicker({
  chosen,
  onChoose,
}: Readonly<{ chosen: string; onChoose: (value: string) => void }>) {
  const [projects, setProjects] = useState<ProjectTables[]>([]);
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((list: { id: string; name: string; tables: string[] }[]) =>
        setProjects(list.map((p) => ({ project: p.id, name: p.name, tables: p.tables }))),
      )
      .catch(() => {
        // Without the list the dialog still offers the open table.
      });
  }, []);
  const [project, table] = chosen.split('/') as [string, string];
  const shown = projects.length ? projects : [{ project, name: project, tables: [table] }];
  return (
    <Field label="Table">
      <select
        aria-label="Table to invite to"
        value={chosen}
        onChange={(e) => onChoose(e.target.value)}
      >
        {shown.map((p) => (
          <optgroup key={p.project} label={p.name}>
            {p.tables.map((t) => (
              <option key={t} value={`${p.project}/${t}`}>
                {t}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

function InviteLinks({
  table,
  links,
  renewed,
}: Readonly<{ table: string; links: string[]; renewed: boolean }>) {
  const [copied, setCopied] = useState<string>();
  // The clipboard is missing on plain-http pages, such as an invite opened over the LAN.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  const copy = (link: string) => void clipboard?.writeText(link).then(() => setCopied(link));
  return (
    <>
      <p>
        Send one of these links. Anyone who has it can join <strong>{table}</strong>, and only that
        table, so share it only with your playtesters.
        {renewed && ' This is a new link; the old one no longer works.'}
      </p>
      <ul className="invite-links">
        {links.map((link) => (
          <li key={link}>
            <code>{link}</code>
            <Button icon={copied === link ? 'check' : 'copy'} onClick={() => copy(link)}>
              {copied === link ? 'Copied' : 'Copy'}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Makes (or with `renew`, replaces) the invite link to one table. */
async function fetchInvite(project: string, table: string, renew = false): Promise<string[]> {
  const response = await fetch('/api/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ project, table, renew }),
  });
  const body = (await response.json()) as { links?: string[]; error?: string };
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body.links ?? [];
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
