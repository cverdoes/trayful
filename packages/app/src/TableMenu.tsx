import { useEffect, useState } from 'react';
import type { ProjectView } from '@trayful/core';
import { go } from './route';
import { useStore } from './store';
import { suggestName, tableChoices } from './tables';

interface ProjectSummary {
  id: string;
  name: string;
  problems: string[];
  tables: string[];
}

const NEW = '\u0000new';
const DUPLICATE = '\u0000duplicate';
const DELETE = '\u0000delete';

/** Switches between the tables (and projects) of the workspace, and makes new ones. */
export function TableMenu() {
  const view = useStore((s) => s.view);
  const host = useStore((s) => s.me?.host);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const refresh = () =>
    void fetch('/api/projects')
      .then((r) => r.json())
      .then((p: ProjectSummary[]) => setProjects(p));
  useEffect(refresh, []);
  if (!view) return null;
  const tables = projects.find((p) => p.id === view.project)?.tables ?? [view.table];
  const onChange = (value: string) =>
    choose(value, view, tables).catch((err: unknown) => {
      useStore.setState({ error: { message: (err as Error).message, at: Date.now() } });
      refresh();
    });

  return (
    <select
      aria-label="Table"
      value={`${view.project}/${view.table}`}
      onFocus={refresh}
      onChange={(e) => void onChange(e.target.value)}
    >
      {(projects.length
        ? projects
        : [{ id: view.project, name: view.name, problems: [], tables }]
      ).map((p) => (
        <optgroup key={p.id} label={p.problems.length ? `${p.name} (has errors)` : p.name}>
          {tableChoices(p, view).map((t) => (
            <option
              key={t}
              value={`${p.id}/${t}`}
              disabled={p.problems.length > 0 && p.id !== view.project}
            >
              {t}
            </option>
          ))}
        </optgroup>
      ))}
      {host && (
        <optgroup label="This table">
          <option value={NEW}>New table…</option>
          <option value={DUPLICATE}>Duplicate this table…</option>
          <option value={DELETE}>Delete this table…</option>
        </optgroup>
      )}
    </select>
  );
}

/** Acts on an option picked in the menu: another table, or a new, copied or deleted one. */
async function choose(value: string, view: ProjectView, tables: string[]): Promise<void> {
  if (value === NEW || value === DUPLICATE) await createTable(view, tables, value === DUPLICATE);
  else if (value === DELETE) await deleteTable(view, tables);
  else {
    const [project, table] = value.split('/');
    go({ project: project!, table });
  }
}

async function createTable(view: ProjectView, tables: string[], copy: boolean): Promise<void> {
  const name = window.prompt(
    copy ? `Name for the copy of ${view.table}:` : 'Name for the new table:',
    suggestName(tables),
  );
  if (!name) return;
  await api('POST', '/api/tables', {
    project: view.project,
    name,
    ...(copy ? { from: view.table } : {}),
  });
  go({ project: view.project, table: name });
}

async function deleteTable(view: ProjectView, tables: string[]): Promise<void> {
  if (!window.confirm(`Delete table "${view.table}" for good? This cannot be undone.`)) return;
  const query = new URLSearchParams({ project: view.project, name: view.table });
  await api('DELETE', `/api/tables?${query}`);
  go({ project: view.project, table: tables.find((t) => t !== view.table) });
}

async function api(method: string, url: string, body?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? response.statusText);
  return result;
}
