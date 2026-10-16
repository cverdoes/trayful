import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describeTable, handTarget, resolveSpots, type Command } from '@trayful/core';
import { z } from 'zod';
import { AGENT_PLAYER } from '../players.js';
import { count, Face, failure, Ids, Pos, Target, text, type ToolContext } from './context.js';

/** Tools for playing: every command, the agent's undo and redo, and starting over. */
export function registerPlayTools(server: McpServer, ctx: ToolContext): void {
  registerMoves(server, ctx);
  registerDrawAndDeal(server, ctx);
  registerPieceTools(server, ctx);
  registerStackTools(server, ctx);
  registerUndoRedo(server, ctx);
  registerReset(server, ctx);
}

/** Moving, stacking and taking single pieces. */
function registerMoves(server: McpServer, ctx: ToolContext): void {
  const { play } = ctx;
  server.registerTool(
    'move',
    {
      title: 'Move',
      description:
        'Move objects. `to` a position puts the first object there and keeps the others in place relative to it; `to` a drop area puts each object in a free spot; `by` shifts them all.',
      inputSchema: {
        ids: Ids,
        to: Target.optional(),
        by: Pos.optional(),
        into: z
          .string()
          .optional()
          .describe('With `by`: also mark the objects as sitting in this drop spot or area.'),
      },
    },
    ({ ids, to, by, into }) =>
      play(`moved ${count(ids.length, 'object')}${typeof to === 'string' ? ` to ${to}` : ''}`, [
        { type: 'move', ids, to, by, into },
      ]),
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
    ({ id, to, face }) => play('took a card from a pile', [{ type: 'take', id, to, face }]),
  );
}

/** Taking cards off the top of a stack. */
function registerDrawAndDeal(server: McpServer, ctx: ToolContext): void {
  const { play, engine, types } = ctx;
  server.registerTool(
    'draw',
    {
      title: 'Draw',
      description:
        'Take cards off the top of a stack, or pieces at random out of a bag, to a position, drop spot or hand. Several land there as a new pile. Nobody sees what is in a bag until it is drawn.',
      inputSchema: {
        from: z
          .string()
          .describe(
            'Stack id, such as `deck:actions`, or a bag as `owner/area`, such as `sack/bag`.',
          ),
        count: z.int().positive().optional().describe('Default 1.'),
        to: Target,
        face: Face.optional().describe('Turn the drawn cards up or down. Default: as they were.'),
      },
    },
    ({ from, count: n, to, face }) =>
      play(`drew ${count(n ?? 1, from.includes('/') ? 'piece' : 'card')}`, [
        { type: 'draw', from, count: n, to, face },
      ]),
  );

  server.registerTool(
    'deal',
    {
      title: 'Deal',
      description:
        'Deal cards from the top of a stack, one at a time to each place in turn, `count` times round. Use one position per player, or a drop area such as `main-board/market` to fill each of its spots.',
      inputSchema: {
        from: z.string().describe('Stack id, such as `deck:actions`.'),
        to: z
          .union([Target, z.array(Target).min(1)])
          .describe('Where the piles go: a list of positions or spots, or one drop area.'),
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
          places +=
            typeof t === 'string' && handTarget(t) === undefined
              ? resolveSpots(engine().state, types(), t).length
              : 1;
        }
      } catch (err) {
        return failure(err);
      }
      const dealt = places * (n ?? 1);
      return play(`dealt ${count(dealt, 'card')}`, [command]);
    },
  );
}

/** Turning, rolling, setting and locking pieces. */
function registerPieceTools(server: McpServer, ctx: ToolContext): void {
  const { play } = ctx;
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
}

/** How a stack lies, and its order. */
function registerStackTools(server: McpServer, ctx: ToolContext): void {
  const { play } = ctx;
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
}

/** Undoing and redoing the agent's own changes. */
function registerUndoRedo(server: McpServer, ctx: ToolContext): void {
  const { session, engine, changes } = ctx;
  server.registerTool(
    'undo',
    {
      title: 'Undo',
      description:
        "Undo your own last change. People's changes are theirs to undo; yours cannot be undone once someone has changed the same pieces.",
    },
    () => {
      const before = engine().state;
      try {
        if (!session().asAgent('undid its last change', () => engine().undo(AGENT_PLAYER)))
          return text('Nothing of yours to undo.');
      } catch (err) {
        return failure(err);
      }
      return text(changes(before, engine().state));
    },
  );

  server.registerTool(
    'redo',
    { title: 'Redo', description: 'Redo the last change of yours you undid.' },
    () => {
      const before = engine().state;
      try {
        if (!session().asAgent('redid its change', () => engine().redo(AGENT_PLAYER)))
          return text('Nothing of yours to redo.');
      } catch (err) {
        return failure(err);
      }
      return text(changes(before, engine().state));
    },
  );
}

/** Starting the table over from the project files. */
function registerReset(server: McpServer, ctx: ToolContext): void {
  const { session, engine, types } = ctx;
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
            `Setup to start from${setupList(Object.keys(session().project.setups))}, or false for everything straight out of the box.`,
          ),
      },
      annotations: { destructiveHint: true },
    },
    ({ seed, setup }) => {
      try {
        session().asAgent('started a new table', () => session().reset(seed, setup, AGENT_PLAYER));
      } catch (err) {
        return failure(err);
      }
      return text(describeTable(engine().state, types()));
    },
  );
}

/** The setups to name in a description, in brackets, or nothing when there are none. */
function setupList(names: string[]): string {
  return names.length ? ` (${names.join(', ')})` : '';
}
