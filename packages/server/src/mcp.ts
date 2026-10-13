import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  applyCommand,
  describeTable,
  queryObjects,
  resolveSpots,
  summarize,
  type Command,
  type TableState,
} from '@trayful/core';
import { toJsonSchemas } from '@trayful/formats';
import { z } from 'zod';
import { addAsset, removeType, setInventory, upsertType } from './authoring.js';
import { docFiles, docsIndex, readDoc } from './docs.js';
import type { Workspace } from './workspace.js';

export interface McpOptions {
  /** Where people can watch the table, mentioned to the agent. */
  url?: string;
}

const Pos = z
  .tuple([z.number(), z.number()])
  .describe('A table position `[x, y]` in millimetres; y grows downwards.');
const Ids = z
  .array(z.string())
  .min(1)
  .describe('Object ids, from describe_table or query_objects.');
const Face = z.enum(['up', 'down']);
const Target = z
  .union([
    Pos,
    z
      .string()
      .describe(
        'A snap target from describe_table: `board/target/index` for one spot, or `board/target` for its free spots in order (or its free area).',
      ),
  ])
  .describe('A position `[x, y]` in mm, or a snap target such as `main-board/market/2`.');

/**
 * Builds an MCP server for a workspace. Play tools act on the active table (the one
 * Trayful opened, or the last one an agent opened with open_table). Agents get the
 * same commands as the browser, so their moves show up live for anyone watching
 * and share one undo history. Authoring tools edit the project files, which every
 * open table picks up at once.
 */
export function createMcpServer(workspace: Workspace, options: McpOptions = {}): McpServer {
  const active = workspace.active;
  const server = new McpServer(
    { name: 'trayful', version: '0.0.0' },
    {
      instructions: [
        `Trayful is a tabletop for boardgame prototypes. The active table is "${active.tableName}" of the project "${active.project.manifest.name}" (${active.projectId})${options.url ? `; people can watch at ${options.url}` : ''}. list_projects shows every project and table; open_table switches.`,
        'To play, start with describe_table. Positions are piece centres in millimetres, y grows downwards. Stacks (piles and decks) hold cards bottom to top; draw and deal take from the top.',
        'Boards declare snap targets (card slots, action spaces, tracks). Use them as `to` in move, draw and deal, e.g. `main-board/fields/3`; pieces in a spot ride along when the board moves.',
        'Face-down cards are hidden: their fields and the order of piles only show with reveal: true, which is like peeking, so only use it when the game allows.',
        'To design components, read trayful://docs (HOWTO guides and the format reference), then use upsert_type, set_inventory and add_asset; render_component shows a type as people will see it. Edits are checked and undone if they would break the project.',
        'Every change goes into the same undo history as the people at the table. Trayful does not know the rules; you bring them.',
      ].join('\n'),
    },
  );
  const session = () => workspace.active;
  const engine = () => workspace.active.engine;
  const types = () => workspace.active.project.types;

  /** Runs commands for the agent and reports which objects changed. */
  const play = (activity: string, commands: Command[]): CallToolResult => {
    const before = engine().state;
    try {
      // Try every command first, so a tool call changes all or nothing.
      commands.reduce((state, command) => applyCommand(state, command, types()), before);
    } catch (err) {
      return failure(err);
    }
    session().asAgent(activity, () => {
      for (const command of commands) engine().dispatch(command);
    });
    return text(changes(before, engine().state));
  };

  const changes = (before: TableState, after: TableState): string => {
    const changed = Object.values(after.objects)
      .filter((o) => before.objects[o.id] !== o && !(o.kind === 'piece' && o.parent))
      .map((o) => summarize(after, types(), o));
    const removed = Object.keys(before.objects).filter((id) => !after.objects[id]);
    return JSON.stringify({ changed, ...(removed.length ? { removed } : {}) });
  };

  // --- Reading ----------------------------------------------------------------

  server.registerTool(
    'describe_table',
    {
      title: 'Describe the table',
      description:
        'A short text overview of everything on the table: piles, pieces, positions and visible card text.',
      inputSchema: { reveal: z.boolean().optional().describe('Also show face-down cards.') },
      annotations: { readOnlyHint: true },
    },
    ({ reveal }) => text(describeTable(engine().state, types(), { reveal })),
  );

  server.registerTool(
    'query_objects',
    {
      title: 'Find objects',
      description:
        'Lists objects on the table as JSON, filtered by type, primitive, field values or region; or lists the cards inside a stack.',
      inputSchema: {
        type: z.string().optional().describe('Component type id, such as `action-card`.'),
        base: z.string().optional().describe('Primitive such as `card`, `meeple`, `die`.'),
        where: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Field values that must all match, such as `{ "suit": "red" }`.'),
        region: z
          .tuple([z.number(), z.number(), z.number(), z.number()])
          .optional()
          .describe('`[x, y, width, height]` in mm; objects whose centre lies inside.'),
        inside: z.string().optional().describe('A stack id: list its pieces, bottom to top.'),
        reveal: z.boolean().optional().describe('Also show face-down cards.'),
      },
      annotations: { readOnlyHint: true },
    },
    (query) => {
      try {
        return text(JSON.stringify(queryObjects(engine().state, types(), query)));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'snapshot',
    {
      title: 'Picture of the table',
      description:
        'A PNG image of the whole table as people see it. Needs the table open in a browser.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const png = await session().requestSnapshot();
        return {
          content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }],
        };
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'get_history',
    {
      title: 'Recent changes',
      description:
        'The most recent changes to the table, oldest first, by people and agents alike.',
      inputSchema: { limit: z.int().positive().optional().describe('How many. Default 20.') },
      annotations: { readOnlyHint: true },
    },
    ({ limit }) => text(JSON.stringify(engine().history.slice(-(limit ?? 20)))),
  );

  // --- Playing ----------------------------------------------------------------

  server.registerTool(
    'move',
    {
      title: 'Move',
      description:
        'Move objects. `to` a position puts the first object there and keeps the others in place relative to it; `to` a snap target puts each object in a free spot; `by` shifts them all.',
      inputSchema: {
        ids: Ids,
        to: Target.optional(),
        by: Pos.optional(),
        into: z
          .string()
          .optional()
          .describe('With `by`: also mark the objects as sitting in this snap spot or area.'),
      },
    },
    ({ ids, to, by, into }) =>
      play(`moved ${count(ids.length, 'object')}${typeof to === 'string' ? ` to ${to}` : ''}`, [
        { type: 'move', ids, to, by, into },
      ]),
  );

  server.registerTool(
    'flip',
    {
      title: 'Flip',
      description: 'Turn cards, tiles or tokens over. Flipping a stack turns the whole pile over.',
      inputSchema: { ids: Ids },
    },
    ({ ids }) => play(`flipped ${count(ids.length, 'object')}`, [{ type: 'flip', ids }]),
  );

  server.registerTool(
    'rotate',
    {
      title: 'Rotate',
      description:
        'Rotate objects by steps (usually 90° each, positive is clockwise) or by degrees.',
      inputSchema: { ids: Ids, steps: z.int().optional(), degrees: z.number().optional() },
    },
    ({ ids, steps, degrees }) =>
      play(`rotated ${count(ids.length, 'object')}`, [{ type: 'rotate', ids, steps, degrees }]),
  );

  server.registerTool(
    'stack',
    {
      title: 'Stack',
      description:
        'Put objects on top of a piece or pile, in the order given (the last ends on top). Stacking onto a single card makes a new pile.',
      inputSchema: { ids: Ids, onto: z.string().describe('The piece or stack to put them on.') },
    },
    ({ ids, onto }) =>
      play(`stacked ${count(ids.length, 'object')}`, [{ type: 'stack', ids, onto }]),
  );

  server.registerTool(
    'draw',
    {
      title: 'Draw',
      description:
        'Take cards off the top of a stack to a position or snap spot. Several cards land there as a new pile.',
      inputSchema: {
        from: z.string().describe('Stack id, such as `deck:actions`.'),
        count: z.int().positive().optional().describe('Default 1.'),
        to: Target,
        face: Face.optional().describe('Turn the drawn cards up or down. Default: as they were.'),
      },
    },
    ({ from, count: n, to, face }) =>
      play(`drew ${count(n ?? 1, 'card')}`, [{ type: 'draw', from, count: n, to, face }]),
  );

  server.registerTool(
    'deal',
    {
      title: 'Deal',
      description:
        'Deal cards from the top of a stack, one at a time to each place in turn, `count` times round. Use one position per player, or a snap target such as `main-board/market` to fill each of its spots.',
      inputSchema: {
        from: z.string().describe('Stack id, such as `deck:actions`.'),
        to: z
          .union([Target, z.array(Target).min(1)])
          .describe('Where the piles go: a list of positions or spots, or one snap target.'),
        count: z.int().positive().optional().describe('Cards per place. Default 1.'),
        face: Face.optional().describe('Deal face up or down. Default: as they were.'),
      },
    },
    ({ from, to, count: n, face }) => {
      const command: Command = { type: 'deal', from, to, count: n, face };
      const targets = typeof to === 'string' || typeof to[0] === 'number' ? [to] : to;
      let places = 0;
      try {
        for (const t of targets as (string | [number, number])[]) {
          places += typeof t === 'string' ? resolveSpots(engine().state, types(), t).length : 1;
        }
      } catch (err) {
        return failure(err);
      }
      const dealt = places * (n ?? 1);
      return play(`dealt ${count(dealt, 'card')}`, [command]);
    },
  );

  server.registerTool(
    'take',
    {
      title: 'Take a card from a pile',
      description:
        'Take one particular card out of a stack, wherever it is in the pile, such as a card chosen from a spread-out market or hand.',
      inputSchema: {
        id: z.string().describe('The card id, from query_objects with `inside`.'),
        to: Target,
        face: Face.optional().describe('Turn it up or down. Default: as it was.'),
      },
    },
    ({ id, to, face }) => play(`took ${id}`, [{ type: 'take', id, to, face }]),
  );

  server.registerTool(
    'layout',
    {
      title: 'Lay out a pile',
      description:
        'Show a stack as a `pile` (only the top card shows), a `fan` (overlapping, like a hand) or `spread` out side by side.',
      inputSchema: {
        id: z.string().describe('Stack id.'),
        layout: z.enum(['pile', 'fan', 'spread']),
      },
    },
    ({ id, layout }) => play(`laid out ${id} as a ${layout}`, [{ type: 'layout', id, layout }]),
  );

  server.registerTool(
    'shuffle',
    {
      title: 'Shuffle',
      description: 'Shuffle a stack. Uses the table seed, so results can be replayed.',
      inputSchema: { id: z.string().describe('Stack id.') },
    },
    ({ id }) => play(`shuffled ${id}`, [{ type: 'shuffle', id }]),
  );

  server.registerTool(
    'roll',
    {
      title: 'Roll',
      description: 'Roll dice and get their new faces.',
      inputSchema: { ids: Ids.describe('Die ids.') },
    },
    ({ ids }) =>
      play(
        `rolled ${count(ids.length, 'die', 'dice')}`,
        ids.map((id) => ({ type: 'roll', id })),
      ),
  );

  server.registerTool(
    'set_counter',
    {
      title: 'Set a counter',
      description: "Set a counter's number (kept within its range) or turn a die to a face.",
      inputSchema: { id: z.string(), value: z.union([z.int(), z.string()]) },
    },
    ({ id, value }) => play(`set ${id} to ${value}`, [{ type: 'setValue', id, value }]),
  );

  server.registerTool(
    'lock',
    {
      title: 'Lock',
      description: 'Lock objects so they cannot be moved by accident, or unlock them.',
      inputSchema: { ids: Ids, locked: z.boolean().optional().describe('Default true.') },
    },
    ({ ids, locked }) =>
      play(`${locked === false ? 'unlocked' : 'locked'} ${count(ids.length, 'object')}`, [
        { type: 'lock', ids, locked: locked ?? true },
      ]),
  );

  // --- History and resets -----------------------------------------------------

  server.registerTool(
    'undo',
    {
      title: 'Undo',
      description: 'Undo the last change, whoever made it.',
    },
    () => {
      const before = engine().state;
      if (!session().asAgent('undid the last change', () => engine().undo()))
        return text('Nothing to undo.');
      return text(changes(before, engine().state));
    },
  );

  server.registerTool(
    'redo',
    { title: 'Redo', description: 'Redo the last undone change.' },
    () => {
      const before = engine().state;
      if (!session().asAgent('redid a change', () => engine().redo()))
        return text('Nothing to redo.');
      return text(changes(before, engine().state));
    },
  );

  server.registerTool(
    'reset_table',
    {
      title: 'Start a new table',
      description:
        "Start over with a fresh table from the project files, set up by the project's default setup (or the one named), with decks shuffled by a new seed. Can be undone.",
      inputSchema: {
        seed: z.int().optional().describe('Seed for repeatable shuffles.'),
        setup: z
          .union([z.string(), z.literal(false)])
          .optional()
          .describe(
            `Setup to start from${Object.keys(active.project.setups).length ? ` (${Object.keys(active.project.setups).join(', ')})` : ''}, or false for everything straight out of the box.`,
          ),
      },
      annotations: { destructiveHint: true },
    },
    ({ seed, setup }) => {
      try {
        session().asAgent('started a new table', () => session().reset(seed, setup));
      } catch (err) {
        return failure(err);
      }
      return text(describeTable(engine().state, types()));
    },
  );

  // --- Projects and tables ----------------------------------------------------

  const tableName = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .describe('Table name: lowercase letters, digits and dashes, such as `playtest-2`.');
  const projectParam = z
    .string()
    .optional()
    .describe('Project id from list_projects. Default: the project of the active table.');

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

  // --- Authoring ------------------------------------------------------------------

  const authored = (summary: string): CallToolResult =>
    text(
      `${summary} Open tables show the change already. Use render_component to see a type, or snapshot to see the table.`,
    );

  server.registerTool(
    'upsert_type',
    {
      title: 'Add or change a component type',
      description:
        'Add a component type to the project library, or replace the type with the same id. The definition follows the library format (see trayful://docs/reference/library.md): id, base primitive, size in mm, fields, and front/back faces made of layers.',
      inputSchema: {
        project: projectParam,
        definition: z
          .record(z.string(), z.unknown())
          .describe(
            'The type, e.g. { "id": "event-card", "base": "card", "size": [63, 88], "fields": { "title": "string" }, "front": { "fill": "#fff", "layers": [{ "text": "{{title}}", "at": [5, 5] }] } }.',
          ),
        file: z
          .string()
          .optional()
          .describe('Library file for a new type. Default: next to types of the same primitive.'),
      },
    },
    async ({ project, definition, file }) => {
      try {
        const projectId = project ?? session().projectId;
        const result = await upsertType(workspace, projectId, definition, file);
        return authored(
          `${result.created ? 'Added' : 'Updated'} type "${String(definition.id)}" in ${result.file}.${result.created ? ' Add components of it with set_inventory.' : ''}`,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'remove_type',
    {
      title: 'Remove a component type',
      description:
        'Remove a component type from the library. Take its components out of the inventory with set_inventory first.',
      inputSchema: { project: projectParam, type: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ project, type }) => {
      try {
        const result = await removeType(workspace, project ?? session().projectId, type);
        return authored(`Removed type "${type}" from ${result.file}.`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'set_inventory',
    {
      title: 'Set what is in the box',
      description:
        'Replace the inventory entries for one component type. Each entry is like an inventory entry without `type`: { count, deck, data, items: [rows], from: "data/file.csv", each: {...} } (see trayful://docs/reference/inventory.md). An empty list takes the type out of the box. New components appear on open tables.',
      inputSchema: {
        project: projectParam,
        type: z.string().describe('Component type id.'),
        entries: z
          .array(z.record(z.string(), z.unknown()))
          .describe(
            'For example [{ "deck": "events", "items": [{ "title": "Storm", "count": 2 }, { "title": "Feast" }] }].',
          ),
      },
    },
    async ({ project, type, entries }) => {
      try {
        const result = await setInventory(workspace, project ?? session().projectId, type, entries);
        return authored(
          `The box now holds ${count(result.count, `"${type}" component`)} (${result.file}).`,
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'add_asset',
    {
      title: 'Add an image or data file',
      description:
        'Write an SVG, PNG, JPEG, GIF, WebP or CSV file into the project, for use in faces (`image` layers) or as card data (`from` in the inventory). SVG and CSV can be given as text, anything as base64. Replaces a file with the same path.',
      inputSchema: {
        project: projectParam,
        path: z.string().describe('Path inside the project folder, such as `assets/storm.svg`.'),
        text: z.string().optional().describe('File contents as text (SVG or CSV).'),
        base64: z.string().optional().describe('File contents as base64 (images).'),
      },
    },
    async ({ project, path: file, text: body, base64 }) => {
      try {
        const result = await addAsset(workspace, project ?? session().projectId, file, {
          text: body,
          base64,
        });
        return authored(`Wrote ${result.file} (${result.bytes} bytes).`);
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'render_component',
    {
      title: 'Picture of a component',
      description:
        'A PNG of one component type, front and back side by side, drawn by the browser exactly as on the table. Give field values to fill its `{{field}}` placeholders. Needs the table open in a browser.',
      inputSchema: {
        type: z.string().describe('Component type id of the active project.'),
        data: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe('Field values. Default: those of the first component of this type.'),
        face: z.enum(['up', 'down', 'both']).optional().describe('Default both.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, data, face }) => {
      try {
        if (!types()[type]) throw new Error(`There is no type "${type}" in this project.`);
        const sample = session().project.components.find((c) => c.type === type)?.data;
        const png = await session().requestRender({ type, data: data ?? sample, face });
        return {
          content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }],
        };
      } catch (err) {
        return failure(err);
      }
    },
  );

  // --- Resources ----------------------------------------------------------------

  const json = (uri: URL, value: unknown) => ({
    contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value) }],
  });
  const variable = (value: string | string[]) => String(Array.isArray(value) ? value[0] : value);

  server.registerResource(
    'projects',
    'trayful://projects',
    {
      title: 'Projects',
      description: 'Every project in the workspace, with its tables.',
      mimeType: 'application/json',
    },
    async (uri) =>
      json(
        uri,
        await Promise.all(
          workspace.projects().map(async (e) => ({
            id: e.id,
            name: e.project?.manifest.name ?? e.id,
            tables: e.project ? await workspace.tables(e.id) : [],
            problems: e.problems,
          })),
        ),
      ),
  );

  const tableResources = (suffix: string) => ({
    list: async () => ({
      resources: (
        await Promise.all(
          workspace
            .projects()
            .filter((e) => e.project)
            .map(async (e) =>
              (await workspace.tables(e.id)).map((t) => ({
                uri: `trayful://project/${e.id}/tables/${t}/${suffix}`,
                name: `${e.id}/${t} ${suffix}`,
              })),
            ),
        )
      ).flat(),
    }),
  });

  server.registerResource(
    'table-state',
    new ResourceTemplate(
      'trayful://project/{project}/tables/{table}/state',
      tableResources('state'),
    ),
    {
      title: 'Table state',
      description: 'Everything on a table as JSON, including face-down cards.',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const s = await workspace.table(variable(vars.project!), variable(vars.table!), {
        create: false,
      });
      return json(uri, s.engine.state);
    },
  );

  server.registerResource(
    'table-snapshot',
    new ResourceTemplate(
      'trayful://project/{project}/tables/{table}/snapshot.png',
      tableResources('snapshot.png'),
    ),
    {
      title: 'Picture of a table',
      description: 'A PNG of a whole table. Needs that table open in a browser.',
      mimeType: 'image/png',
    },
    async (uri, vars) => {
      const s = await workspace.table(variable(vars.project!), variable(vars.table!), {
        create: false,
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'image/png',
            blob: (await s.requestSnapshot()).toString('base64'),
          },
        ],
      };
    },
  );

  server.registerResource(
    'project-manifest',
    new ResourceTemplate('trayful://project/{project}/manifest', {
      list: () => ({
        resources: workspace.projects().map((e) => ({
          uri: `trayful://project/${e.id}/manifest`,
          name: e.project?.manifest.name ?? e.id,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Project',
      description: 'A project manifest, its component types, decks, setups and what is in the box.',
      mimeType: 'application/json',
    },
    (uri, vars) => {
      const project = workspace.project(variable(vars.project!));
      return json(uri, {
        manifest: project.manifest,
        types: Object.keys(project.types),
        decks: project.decks,
        setups: Object.keys(project.setups),
        components: project.components.map((c) => ({ id: c.id, type: c.type, deck: c.deck })),
      });
    },
  );

  server.registerResource(
    'component-type',
    new ResourceTemplate('trayful://project/{project}/types/{type}', {
      list: () => ({
        resources: workspace
          .projects()
          .filter((e) => e.project)
          .flatMap((e) =>
            Object.values(e.project!.types).map((t) => ({
              uri: `trayful://project/${e.id}/types/${t.id}`,
              name: t.name ?? t.id,
              mimeType: 'application/json',
            })),
          ),
      }),
    }),
    {
      title: 'Component type',
      description: 'One component type: fields, faces, size, and the library file it lives in.',
    },
    (uri, vars) => {
      const project = workspace.project(variable(vars.project!));
      const found = project.types[variable(vars.type!)];
      if (!found) throw new Error(`No component type "${variable(vars.type!)}".`);
      const definition: Record<string, unknown> = { ...found, file: found.source.file };
      delete definition.source;
      delete definition.normalizedFields;
      return json(uri, definition);
    },
  );

  server.registerResource(
    'schema',
    'trayful://schema',
    {
      title: 'File format schemas',
      description: 'JSON Schemas for every Trayful file kind.',
      mimeType: 'application/json',
    },
    (uri) => json(uri, toJsonSchemas()),
  );

  server.registerResource(
    'docs',
    'trayful://docs',
    {
      title: 'Documentation index',
      description:
        'HOWTO guides for designers and the full file format reference, as a list of documents to read.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await docsIndex() }],
    }),
  );

  server.registerResource(
    'doc',
    new ResourceTemplate('trayful://docs/{+path}', {
      list: async () => ({
        resources: (await docFiles()).map((file) => ({
          uri: `trayful://docs/${file}`,
          name: file,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Documentation page',
      description: 'One guide or reference page.',
      mimeType: 'text/markdown',
    },
    async (uri, vars) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: await readDoc(variable(vars.path!)) },
      ],
    }),
  );

  return server;
}

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function failure(err: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
  };
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
