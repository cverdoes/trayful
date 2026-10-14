import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describeTable, queryObjects } from '@trayful/core';
import { z } from 'zod';
import { AGENT_PLAYER } from '../players.js';
import { failure, text, type ToolContext } from './context.js';

/** Tools for looking at the table. */
export function registerReadingTools(server: McpServer, ctx: ToolContext): void {
  registerDescribe(server, ctx);
  registerSnapshotAndHistory(server, ctx);
}

/** The text overview and the JSON query of what is on the table. */
function registerDescribe(server: McpServer, ctx: ToolContext): void {
  const { engine, types } = ctx;
  server.registerTool(
    'describe_table',
    {
      title: 'Describe the table',
      description:
        'A short text overview of everything on the table: piles, pieces, positions and visible card text, your own hand, and how many pieces the other players hold.',
      inputSchema: { reveal: z.boolean().optional().describe('Also show face-down cards.') },
      annotations: { readOnlyHint: true },
    },
    ({ reveal }) => text(describeTable(engine().state, types(), { reveal, viewer: AGENT_PLAYER })),
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
        inside: z
          .string()
          .optional()
          .describe(
            `A stack id: list its pieces, bottom to top. \`hand:${AGENT_PLAYER}\` lists your hand.`,
          ),
        reveal: z.boolean().optional().describe('Also show face-down cards.'),
      },
      annotations: { readOnlyHint: true },
    },
    (query) => {
      try {
        return text(
          JSON.stringify(queryObjects(engine().state, types(), { ...query, viewer: AGENT_PLAYER })),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** A picture of the table, and what changed lately. */
function registerSnapshotAndHistory(server: McpServer, ctx: ToolContext): void {
  const { session, engine } = ctx;
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
    ({ limit }) => {
      // Pieces in other players' hands are named only as hidden, so the history cannot
      // tell you what they hold.
      const state = engine().state;
      const steps = JSON.stringify(
        engine().history.slice(-(limit ?? 20)),
        (_key, value: unknown) => {
          const piece = typeof value === 'string' ? state.objects[value] : undefined;
          return piece?.kind === 'piece' && piece.hand && piece.hand !== AGENT_PLAYER
            ? 'a hidden piece'
            : value;
        },
      );
      return text(steps);
    },
  );
}
