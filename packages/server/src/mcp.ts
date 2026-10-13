import path from 'node:path';
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
import type { TableSession } from './session.js';

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
 * Builds an MCP server for one open table. Agents get the same commands as the
 * browser, so their moves show up live for anyone watching and share one undo history.
 */
export function createMcpServer(session: TableSession, options: McpOptions = {}): McpServer {
  const project = session.project;
  const projectId = path.basename(project.dir);
  const tableUri = `trayful://table/${session.tableName}`;
  const server = new McpServer(
    { name: 'trayful', version: '0.0.0' },
    {
      instructions: [
        `Trayful is a tabletop for boardgame prototypes. This server controls the table "${session.tableName}" of the project "${project.manifest.name}"${options.url ? `, which people can watch at ${options.url}` : ''}.`,
        'Start with describe_table. Positions are piece centres in millimetres, y grows downwards. Stacks (piles and decks) hold cards bottom to top; draw and deal take from the top.',
        'Boards declare snap targets (card slots, action spaces, tracks). Use them as `to` in move, draw and deal, e.g. `main-board/fields/3`; pieces in a spot ride along when the board moves.',
        'Face-down cards are hidden: their fields and the order of piles only show with reveal: true, which is like peeking, so only use it when the game allows.',
        'Every change goes into the same undo history as the people at the table. Trayful does not know the rules; you bring them.',
      ].join('\n'),
    },
  );
  const types = project.types;
  const engine = session.engine;

  /** Runs commands for the agent and reports which objects changed. */
  const play = (activity: string, commands: Command[]): CallToolResult => {
    const before = engine.state;
    try {
      // Try every command first, so a tool call changes all or nothing.
      commands.reduce((state, command) => applyCommand(state, command, types), before);
    } catch (err) {
      return failure(err);
    }
    session.asAgent(activity, () => {
      for (const command of commands) engine.dispatch(command);
    });
    return text(changes(before, engine.state));
  };

  const changes = (before: TableState, after: TableState): string => {
    const changed = Object.values(after.objects)
      .filter((o) => before.objects[o.id] !== o && !(o.kind === 'piece' && o.parent))
      .map((o) => summarize(after, types, o));
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
    ({ reveal }) => text(describeTable(engine.state, types, { reveal })),
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
        return text(JSON.stringify(queryObjects(engine.state, types, query)));
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
        const png = await session.requestSnapshot();
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
    ({ limit }) => text(JSON.stringify(engine.history.slice(-(limit ?? 20)))),
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
          places += typeof t === 'string' ? resolveSpots(engine.state, types, t).length : 1;
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
      const before = engine.state;
      if (!session.asAgent('undid the last change', () => engine.undo()))
        return text('Nothing to undo.');
      return text(changes(before, engine.state));
    },
  );

  server.registerTool(
    'redo',
    { title: 'Redo', description: 'Redo the last undone change.' },
    () => {
      const before = engine.state;
      if (!session.asAgent('redid a change', () => engine.redo())) return text('Nothing to redo.');
      return text(changes(before, engine.state));
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
            `Setup to start from${Object.keys(project.setups).length ? ` (${Object.keys(project.setups).join(', ')})` : ''}, or false for everything straight out of the box.`,
          ),
      },
      annotations: { destructiveHint: true },
    },
    ({ seed, setup }) => {
      try {
        session.asAgent('started a new table', () => session.reset(seed, setup));
      } catch (err) {
        return failure(err);
      }
      return text(describeTable(engine.state, types));
    },
  );

  // --- Resources ----------------------------------------------------------------

  server.registerResource(
    'table-state',
    `${tableUri}/state`,
    {
      title: 'Table state',
      description: 'Everything on the table as JSON, including face-down cards.',
      mimeType: 'application/json',
    },
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(engine.state) },
      ],
    }),
  );

  server.registerResource(
    'table-snapshot',
    `${tableUri}/snapshot.png`,
    {
      title: 'Picture of the table',
      description: 'A PNG of the whole table. Needs the table open in a browser.',
      mimeType: 'image/png',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'image/png',
          blob: (await session.requestSnapshot()).toString('base64'),
        },
      ],
    }),
  );

  server.registerResource(
    'project-manifest',
    `trayful://project/${projectId}/manifest`,
    {
      title: 'Project',
      description: 'The project manifest, its component types, decks and what is in the box.',
      mimeType: 'application/json',
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            manifest: project.manifest,
            types: Object.keys(types),
            decks: project.decks,
            components: project.components.map((c) => ({ id: c.id, type: c.type, deck: c.deck })),
          }),
        },
      ],
    }),
  );

  server.registerResource(
    'component-type',
    new ResourceTemplate(`trayful://project/${projectId}/types/{type}`, {
      list: () => ({
        resources: Object.keys(types).map((id) => ({
          uri: `trayful://project/${projectId}/types/${id}`,
          name: types[id]!.name ?? id,
          mimeType: 'application/json',
        })),
      }),
    }),
    { title: 'Component type', description: 'One component type: fields, faces and size.' },
    (uri, { type }) => {
      // The client-facing view leaves out the loader's bookkeeping.
      const definition = session.view().types[String(type)];
      if (!definition) throw new Error(`No component type "${type}".`);
      return {
        contents: [
          { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(definition) },
        ],
      };
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
    (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(toJsonSchemas()) },
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
