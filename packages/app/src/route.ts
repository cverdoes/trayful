/** The designer's pages: how components look, how many are in the box, and the images they use. */
export type DesignPage = 'components' | 'tray' | 'assets';

/** Which project and table this page shows, from `?project=…&table=…` in its address. */
export function route(): {
  project?: string;
  table?: string;
  print: boolean;
  /** Design mode, showing the type named by `type` if any, on one of its pages. */
  design: boolean;
  page: DesignPage;
  type?: string;
  join: boolean;
} {
  const params = new URLSearchParams(location.search);
  return {
    project: params.get('project') ?? undefined,
    table: params.get('table') ?? undefined,
    print: params.has('print'),
    design: params.has('design'),
    page: (['assets', 'tray'] as const).find((page) => params.has(page)) ?? 'components',
    type: params.get('type') ?? undefined,
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

/** Opens another table (or its print sheets, or design mode) in this window. */
export function go(to: {
  project: string;
  table?: string;
  print?: boolean;
  design?: boolean;
}): void {
  const params = new URLSearchParams({ project: to.project });
  if (to.table) params.set('table', to.table);
  if (to.print) params.set('print', '');
  if (to.design) params.set('design', '');
  location.search = params.toString();
}

/** Puts the design page shown in the address, without reloading. */
export function showDesignPage(page: DesignPage): void {
  const params = new URLSearchParams(location.search);
  params.delete('assets');
  params.delete('tray');
  if (page !== 'components') params.set(page, '');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

/** Puts the type shown in design mode in the address, so a reload or a shared link shows it again. */
export function showTypeInAddress(id: string): void {
  const params = new URLSearchParams(location.search);
  params.set('type', id);
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

/** Drops `?join` from the address once the player has joined, so a reload goes straight in. */
export function forgetJoin(): void {
  const params = new URLSearchParams(location.search);
  params.delete('join');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
}
