import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * MCP prompts: ready-made asks that clients offer as slash commands, such as
 * `/trayful:run-game` in Claude Code. Not to be mixed up with player prompts, which
 * the `prompt` tool shows to the people at the table.
 */
export function registerStarters(server: McpServer): void {
  server.registerPrompt(
    'run-game',
    {
      title: 'Run a game',
      description:
        'Have the agent run the game at the open table: explain the rules, ask players what they do, and follow along.',
      argsSchema: {
        rules: z
          .string()
          .optional()
          .describe('Where the rules are, such as `rules.md`, or the rules themselves.'),
        style: z
          .enum(['referee', 'tutorial'])
          .optional()
          .describe(
            '`referee` keeps turns and answers questions; `tutorial` teaches step by step.',
          ),
      },
    },
    ({ rules, style }) => ({
      messages: [{ role: 'user', content: { type: 'text', text: runGame(rules, style) } }],
    }),
  );
}

function runGame(rules: string | undefined, style: 'referee' | 'tutorial' | undefined): string {
  const teach = style === 'tutorial';
  return [
    `Run the game at the open Trayful table${teach ? ' as a tutorial, teaching it one step at a time' : ' as its referee'}.`,
    rules
      ? `The rules: ${rules}. Read them first.`
      : 'Ask me where the rules are, or what game this is, before you start.',
    '',
    '1. Call describe_table to see the pieces, the drop areas and the players (listed by id at the end). Then call wait_for_events with seconds: 0 and keep its `next`.',
    teach
      ? '2. Explain each step with prompt kind `message`, with `anchor` on the piece or place it is about and `highlight` on what to look at. Wait for OK before the next step.'
      : '2. Tell everyone how the game starts with prompt kind `message`, to `everyone`. Set the table up with the play tools if the rules say how.',
    '3. On each turn, ask the player whose turn it is with prompt: `choice` for an action, `pick` for pieces (their `candidates`), `place` for where something goes, `number` for an amount.',
    "4. Loop on wait_for_events with `since` set to the last `next`. Do the moves that answers call for, as yourself. When someone moves a piece, check it against the rules and say so in a message; never undo another player's move.",
    '5. Keep it advisory: players may move anything, and you only explain and ask. When the game ends, say who won, and cancel_prompt anything still open.',
  ].join('\n');
}
