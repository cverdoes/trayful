import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { checkImageName, setImage } from '../assets.js';
import { addAsset, removeType, setInventory, upsertType } from '../authoring.js';
import { migrateFolder } from '../migrate.js';
import { renameType } from '../renaming.js';
import { count, failure, projectParam, text, type ToolContext } from './context.js';

const authored = (summary: string): CallToolResult =>
  text(
    `${summary} Open tables show the change already. Use render_component to see a type, or snapshot to see the table.`,
  );

/** Tools for designing components: the library, the inventory and assets. */
export function registerAuthoringTools(server: McpServer, ctx: ToolContext): void {
  registerTypeTools(server, ctx);
  registerRenameTool(server, ctx);
  registerBoxTools(server, ctx);
  registerRender(server, ctx);
  registerMigrate(server, ctx);
}

/** Adding, changing and removing component types. */
function registerTypeTools(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'upsert_type',
    {
      title: 'Add or change a component type',
      description:
        'Add a component type to the project library, or replace the type with the same id. The definition follows the library format (see trayful://docs/reference/library.md): id, size in mm, what it `is` (piece, zone, die or counter), its `face`, and the behaviours it has (`flippable`, `rotates`, `stackable`, `container`, `values`).',
      inputSchema: {
        project: projectParam,
        definition: z
          .record(z.string(), z.unknown())
          .describe(
            'The type, e.g. { "id": "event-card", "size": [63, 88], "is": "piece", "flippable": true, "stackable": true, "face": { "fill": "#fff", "labels": [{ "field": "title", "at": [5, 5] }] } }.',
          ),
        file: z
          .string()
          .optional()
          .describe(
            'Library file for a new type. Default: next to types that are the same kind of thing (`is`).',
          ),
      },
    },
    async ({ project, definition, file }) => {
      try {
        const projectId = project ?? session().projectId;
        const result = await upsertType(workspace, projectId, definition, { file });
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
}

/** Giving a type a new id everywhere it is used. */
function registerRenameTool(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'rename_type',
    {
      title: 'Rename a component type',
      description:
        'Give a component type a new id, and change every reference to it in one go: its library definition, `accepts` lists of drop areas, `stackable.with` lists, inventory entries, and setup steps that place its components or use its drop areas. Component ids change with it (`worker.red.1` becomes `farmer.red.1`).',
      inputSchema: {
        project: projectParam,
        type: z.string().describe('Current type id.'),
        to: z.string().describe('New type id: lowercase letters, digits and dashes.'),
      },
    },
    async ({ project, type, to }) => {
      try {
        const result = await renameType(workspace, project ?? session().projectId, type, to);
        return authored(`Renamed type "${type}" to "${result.id}" in ${result.files.join(', ')}.`);
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** What is in the box, and the files its components use. */
function registerBoxTools(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'set_inventory',
    {
      title: 'Set what is in the box',
      description:
        'Replace the inventory entries for one component type. Each entry is like an inventory entry without `component`: { count, deck, data, items: [rows], from: "data/file.csv", each: {...} } (see trayful://docs/reference/inventory.md). An empty list takes the type out of the box. New components appear on open tables.',
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
        'Write an SVG, PNG, JPEG, GIF, WebP or CSV file into the project, as card data (`from` in the inventory) or as an image. Give an image a `name` to use it on faces (`image: <name>`), and `rows` and `cols` to cut it into tiles, as on a sheet of cards or a die strip; that names it in the assets file. SVG and CSV can be given as text, anything as base64. Replaces a file with the same path.',
      inputSchema: {
        project: projectParam,
        path: z.string().describe('Path inside the project folder, such as `assets/storm.svg`.'),
        text: z.string().optional().describe('File contents as text (SVG or CSV).'),
        base64: z.string().optional().describe('File contents as base64 (images).'),
        name: z
          .string()
          .optional()
          .describe('For an image: the name faces use, such as `terrain` or `d6-faces`.'),
        rows: z.int().positive().optional().describe('With `name`: rows of tiles. Default 1.'),
        cols: z.int().positive().optional().describe('With `name`: columns of tiles. Default 1.'),
      },
    },
    async ({ project, path: file, text: body, base64, name, rows, cols }) => {
      try {
        const projectId = project ?? session().projectId;
        // A bad name is refused before the file is written.
        if (name !== undefined) checkImageName(name);
        const result = await addAsset(workspace, projectId, file, { text: body, base64 });
        if (name !== undefined) await setImage(workspace, projectId, name, { file, rows, cols });
        const named = name === undefined ? '' : ` Faces use it as "${name}".`;
        return authored(`Wrote ${result.file} (${result.bytes} bytes).${named}`);
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** A picture of one component type. */
function registerRender(server: McpServer, ctx: ToolContext): void {
  const { session, types } = ctx;
  server.registerTool(
    'render_component',
    {
      title: 'Picture of a component',
      description:
        'A PNG of one component type, face and back side by side, drawn by the browser exactly as on the table. Give field values to fill its `{{field}}` placeholders. Needs the table open in a browser.',
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
}

/** Moving a project made for an earlier Trayful to the current file format. */
function registerMigrate(server: McpServer, ctx: ToolContext): void {
  const { workspace, session } = ctx;
  server.registerTool(
    'migrate_project',
    {
      title: 'Move a project to the current format',
      description:
        'Rewrite a project made in the first file format (trayful/1) in the current one, as `trayful migrate` does. Such projects play as they are, but their components can only be changed after this.',
      inputSchema: { project: projectParam },
    },
    async ({ project }) => {
      try {
        const projectId = project ?? session().projectId;
        const files = await migrateFolder(workspace.entry(projectId).dir);
        await workspace.reload(projectId);
        return authored(`Rewrote ${files.join(', ')} in the current format.`);
      } catch (err) {
        return failure(err);
      }
    },
  );
}
