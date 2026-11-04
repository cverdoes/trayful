// Helpers for the app's unit tests, which run in Node.
import { applyCommand, createTable, type Command, type TableState } from '@trayful/core';
import { loadProject, type ResolvedProject } from '@trayful/formats';

const example = new URL('../../../examples/harvest-moon', import.meta.url).pathname;

/** The Harvest Moon example, set up for two players with seed 42, as the tests' table. */
export async function exampleTable(): Promise<{ project: ResolvedProject; table: TableState }> {
  const { project } = await loadProject(example);
  if (!project) throw new Error('The example project failed to load.');
  return { project, table: createTable(project, { name: 'test', seed: 42 }) };
}

/** The table after some commands. */
export function after(project: ResolvedProject, table: TableState, ...commands: Command[]) {
  return commands.reduce((state, command) => applyCommand(state, command, project.types), table);
}
