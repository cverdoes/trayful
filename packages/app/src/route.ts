/** Which project and table this page shows, from `?project=…&table=…` in its address. */
export function route(): { project?: string; table?: string; print: boolean } {
  const params = new URLSearchParams(location.search);
  return {
    project: params.get('project') ?? undefined,
    table: params.get('table') ?? undefined,
    print: params.has('print'),
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
