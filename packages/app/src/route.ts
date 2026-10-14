/** Which project and table this page shows, from `?project=…&table=…` in its address. */
export function route(): { project?: string; table?: string; print: boolean; join: boolean } {
  const params = new URLSearchParams(location.search);
  return {
    project: params.get('project') ?? undefined,
    table: params.get('table') ?? undefined,
    print: params.has('print'),
    // Set by an invite link: ask for a name even on the host's computer.
    join: params.has('join'),
  };
}

/** The query string for API and socket requests about this page's table. */
export function tableQuery(): string {
  const { project, table } = route();
  const params = new URLSearchParams();
  if (project) params.set('project', project);
  if (table) params.set('table', table);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Opens another table (or the print sheets) in this window. */
export function go(to: { project: string; table?: string; print?: boolean }): void {
  const params = new URLSearchParams({ project: to.project });
  if (to.table) params.set('table', to.table);
  if (to.print) params.set('print', '');
  location.search = params.toString();
}

/** Drops `?join` from the address once the player has joined, so a reload goes straight in. */
export function forgetJoin(): void {
  const params = new URLSearchParams(location.search);
  params.delete('join');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}
