import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describeTable, queryObjects, type PlayerInfo } from '@trayful/core';
import { z } from 'zod';
import { AGENT_PLAYER } from '../play/players.js';
import { failure, text, type ToolContext } from './context.js';

/** Tools for looking at the table. */
export function registerReadingTools(server: McpServer, ctx: ToolContext): void {
  registerDescribe(server, ctx);
  registerSnapshotAndHistory(server, ctx);
}

/** The text overview and the JSON query of what is on the table. */
function registerDescribe(server: McpServer, ctx: ToolContext): void {
  const { engine, types, session } = ctx;
  server.registerTool(
    'describe_table',
    {
      title: 'Describe the table',
      description:
        'A short text overview of everything on the table: its surfaces, piles, pieces, positions and visible card text, your own hand, and how many pieces the other players hold.',
      inputSchema: {
        reveal: z.boolean().optional().describe('Also show face-down cards.'),
        surface: z
          .string()
          .optional()
          .describe('Describe only what lies on this surface, such as `centre`.'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ reveal, surface }) => {
      try {
        return text(
          [
            describeTable(engine().state, types(), { reveal, viewer: AGENT_PLAYER, surface }),
            playerLines(session().roster()),
          ].join('\n\n'),
        );
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'query_objects',
    {
      title: 'Find objects',
      description:
        'Lists objects on the table as JSON, filtered by type, representation, field values or region; or lists the cards inside a stack.',
      inputSchema: {
        type: z.string().optional().describe('Component type id, such as `action-card`.'),
        is: z.string().optional().describe('What it is: `piece`, `zone`, `die` or `counter`.'),
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
        surface: z.string().optional().describe('Only objects lying on this surface.'),
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
        'A PNG image of the whole of one surface of the table (the Centre unless named) as people see it. Needs the table open in a browser that shows that surface.',
      inputSchema: {
        surface: z
          .string()
          .optional()
          .describe('Surface to picture, from describe_table. Default: the Centre.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ surface }) => {
      try {
        const png = await session().requestSnapshot(surface);
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

/** Who is at the table, by the ids that `hand:<id>` targets and prompts take. */
function playerLines(players: readonly PlayerInfo[]): string {
  if (players.length === 0) return 'Players: nobody has joined this table yet.';
  const line = (p: PlayerInfo) =>
    `- ${p.id}: ${p.name} (${p.role}${p.online ? ', here now' : ', away'})`;
  return ['Players (ids for `hand:<id>` and for prompt `to`):', ...players.map(line)].join('\n');
}
