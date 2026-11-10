import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';

const SurfaceId = z.string().describe('Surface id, such as `red`; `centre` is the Centre.');
const Name = z.string().min(1).describe('Name shown on its tile, such as `Red player`.');
const Seat = z.boolean().describe('Whether a player can sit there.');
const Color = z
  .string()
  .describe(
    "Colour of its tile frame and chip: a name from the project's colours, such as `red`, or a CSS colour such as `#c5523a`.",
  );
const After = z
  .string()
  .describe('The surface whose tile it goes after; `centre` puts it first after the Centre.');

/** Tools for a table's surfaces: separate play spaces everyone sees, such as player areas. */
export function registerSurfaceTools(server: McpServer, ctx: ToolContext): void {
  const { play } = ctx;
  server.registerTool(
    'add_surface',
    {
      title: 'Add a surface',
      description:
        'Add a surface to the table: a separate play space with its own positions, shown as its own tile, such as a player area. Everyone sees every surface; hands stay the only private place.',
      inputSchema: {
        id: SurfaceId,
        name: Name.optional().describe('Name shown on its tile. Default: the id.'),
        seat: Seat.optional(),
        color: Color.optional(),
        after: After.optional(),
      },
    },
    ({ id, name, seat, color, after }) =>
      play(`added surface ${id}`, [{ type: 'addSurface', id, name, seat, color, after }]),
  );

  server.registerTool(
    'edit_surface',
    {
      title: 'Change a surface',
      description:
        'Rename a surface, make it a seat or not, colour it, or move its tile after another. The Centre can only be renamed or coloured.',
      inputSchema: {
        id: SurfaceId,
        name: Name.optional(),
        seat: Seat.optional(),
        color: Color.optional().describe(
          "Colour of its tile frame and chip, from the project's colours or a CSS colour; an empty string takes it off.",
        ),
        after: After.optional(),
      },
    },
    ({ id, name, seat, color, after }) =>
      play(`changed surface ${id}`, [{ type: 'editSurface', id, name, seat, color, after }]),
  );

  server.registerTool(
    'remove_surface',
    {
      title: 'Remove a surface',
      description:
        'Remove a surface. Whatever lies on it moves to free room on the surface `to`, keeping its shape. The Centre cannot be removed.',
      inputSchema: {
        id: SurfaceId,
        to: z
          .string()
          .optional()
          .describe('Where what lies on it goes, such as `centre`. Needed unless it is empty.'),
      },
    },
    ({ id, to }) => play(`removed surface ${id}`, [{ type: 'removeSurface', id, to }]),
  );

  server.registerTool(
    'sit',
    {
      title: 'Sit at a surface',
      description:
        'Sit a player at a seat surface, which makes it theirs in the browser\'s "Mine + Centre" view; leave out `player` to stand whoever sits there up. It changes nothing about who may touch what.',
      inputSchema: {
        surface: SurfaceId,
        player: z.string().optional().describe('Player id, from describe_table, such as `claude`.'),
      },
    },
    ({ surface, player }) =>
      play(player ? `sat ${player} at ${surface}` : `stood up from ${surface}`, [
        { type: 'sit', surface, player },
      ]),
  );
}
