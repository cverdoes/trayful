/** The tables to offer for a project: the open table is always listed, and a project has at least one. */
export function tableChoices(
  project: { id: string; tables: string[] },
  view: { project: string; table: string },
): string[] {
  if (project.id === view.project && !project.tables.includes(view.table))
    return [...project.tables, view.table];
  return project.tables.length ? project.tables : ['table-1'];
}

/** A name for a new table that the project does not use yet: `table-<n>`. */
export function suggestName(tables: string[]): string {
  let n = tables.length + 1;
  while (tables.includes(`table-${n}`)) n++;
  return `table-${n}`;
}
