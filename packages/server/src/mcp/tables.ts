import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describeTable } from '@trayful/core';
import { z } from 'zod';
import { failure, projectParam, tableName, text, type ToolContext } from './context.js';

/** Tools for projects and their saved tables. */
export function registerTableTools(server: McpServer, ctx: ToolContext): void {
  registerProjectList(server, ctx);
  registerTableFiles(server, ctx);
  registerProjectTools(server, ctx);
}

/** Listing projects and switching tables. */
function registerProjectList(server: McpServer, ctx: ToolContext): void {
  const { workspace, session, engine, types } = ctx;
  server.registerTool(
    'list_projects',
    {
      title: 'List projects and tables',
      description:
        'Every project in the workspace with its tables, any problems in its files, and which table is active.',
      annotations: { readOnlyHint: true },
    },
    async () =>
      text(
        JSON.stringify({
          active: { project: session().projectId, table: session().tableName },
          projects: await Promise.all(
            workspace.projects().map(async (entry) => ({
              id: entry.id,
              name: entry.project?.manifest.name ?? entry.id,
              tables: entry.project ? await workspace.tables(entry.id) : [],
              ...(entry.problems.length ? { problems: entry.problems } : {}),
            })),
          ),
        }),
      ),
  );

  server.registerTool(
    'open_table',
    {
      title: 'Open a table',
      description:
        'Make a table the active one that play tools act on. A table that does not exist yet is created from the project files and its default setup.',
      inputSchema: {
        project: projectParam,
        table: tableName,
        setup: z
          .union([z.string(), z.literal(false)])
          .optional()
          .describe('For a new table: the setup to start from, or false for none.'),
        seed: z.int().optional().describe('For a new table: seed for repeatable shuffles.'),
      },
    },
    async ({ project, table, setup, seed }) => {
      try {
        const projectId = project ?? session().projectId;
        const existed = (await workspace.tables(projectId)).includes(table);
        workspace.active = await workspace.table(projectId, table, { setup, seed });
        const intro = `${existed ? 'Opened' : 'Created'} table "${table}" of ${projectId}.`;
        return text(`${intro}\n\n${describeTable(engine().state, types())}`);
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** Copying and deleting saved tables. */
function registerTableFiles(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'duplicate_table',
    {
      title: 'Duplicate a table',
      description:
        'Copy a table under a new name, to branch a game or keep a position. Does not change the active table.',
      inputSchema: {
        project: projectParam,
        from: tableName.optional().describe('Table to copy. Default: the active table.'),
        to: tableName,
      },
    },
    async ({ project, from, to }) => {
      try {
        const projectId = project ?? session().projectId;
        await workspace.duplicateTable(projectId, from ?? session().tableName, to);
        return text(`Copied to table "${to}". Open it with open_table.`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'delete_table',
    {
      title: 'Delete a table',
      description: 'Delete a saved table for good. The active table cannot be deleted.',
      inputSchema: { project: projectParam, table: tableName },
      annotations: { destructiveHint: true },
    },
    async ({ project, table }) => {
      try {
        await workspace.deleteTable(project ?? session().projectId, table);
        return text(`Deleted table "${table}".`);
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** Creating and checking projects. */
function registerProjectTools(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description:
        'Start a new prototype from the starter template (a card type, a deck and a token), in a new folder of the workspace. Only when Trayful was started on a folder of projects.',
      inputSchema: { name: z.string().min(1).describe('Name of the game, such as "Moon Market".') },
    },
    async ({ name }) => {
      try {
        const entry = await workspace.createProject(name);
        return text(
          `Created project "${entry.id}" in ${entry.dir}. Open a table on it with open_table { project: "${entry.id}", table: "table-1" }.`,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'validate_project',
    {
      title: 'Check a project',
      description:
        'Reload a project from its files and report any problems with file, line and column. Use after editing files directly.',
      inputSchema: { project: projectParam },
      annotations: { readOnlyHint: true },
    },
    async ({ project }) => {
      try {
        const projectId = project ?? session().projectId;
        const problems = await workspace.reload(projectId);
        if (problems.length) return text(`Problems:\n${problems.join('\n')}`);
        const p = workspace.project(projectId);
        return text(
          `${p.manifest.name} loads cleanly: ${Object.keys(p.types).length} types, ${p.components.length} components, ${Object.keys(p.decks).length} decks, ${Object.keys(p.setups).length} setups.`,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );
}
