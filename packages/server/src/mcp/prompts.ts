import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { PromptStatus } from '../play/prompts.js';
import { failure, text, type ToolContext } from './context.js';

/** How long `wait_for_events` waits at most, so a tool call never hangs on a quiet table. */
const MAX_WAIT_SECONDS = 50;
const DEFAULT_WAIT_SECONDS = 25;

/** The name players see as asking. The agent asks as itself. */
const ASKER = 'Claude';

/** Tools for running a game from outside: asking players things and following the table. */
export function registerPromptTools(server: McpServer, ctx: ToolContext): void {
  registerAsking(server, ctx);
  registerFollowing(server, ctx);
}

const Option = z.object({
  id: z.string().min(1).describe('What the answer calls this option, such as `coins`.'),
  label: z.string().min(1).describe('What the player sees, such as "Take 2 coins".'),
});

/** Asking players, and withdrawing a question. */
function registerAsking(server: McpServer, ctx: ToolContext): void {
  const { session } = ctx;
  server.registerTool(
    'prompt',
    {
      title: 'Ask players',
      description:
        'Show players a message, a yes/no question or a choice, in a panel above their hand. Each player it is for answers once. Answers arrive as `answered` events from wait_for_events; set `wait` to also wait here for them.',
      inputSchema: {
        to: z
          .array(z.string())
          .min(1)
          .describe('Player ids, as describe_table lists them under Players.'),
        kind: z
          .enum(['message', 'confirm', 'choice'])
          .describe(
            '`message` is dismissed with OK; `confirm` asks yes or no; `choice` lists options.',
          ),
        title: z.string().optional().describe('A few words above the text, such as "Your turn".'),
        text: z.string().min(1).describe('What to tell or ask the players.'),
        options: z.array(Option).optional().describe('For `choice`: at least two options.'),
        min: z
          .number()
          .int()
          .optional()
          .describe('For `choice`: fewest options to pick. Default 1.'),
        max: z
          .number()
          .int()
          .optional()
          .describe('For `choice`: most options to pick. Default `min`.'),
        wait: z
          .number()
          .min(0)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .describe(`Seconds to wait for every answer, up to ${MAX_WAIT_SECONDS}. Default 0.`),
      },
    },
    async ({ to, wait, ...request }) => {
      try {
        const unknown = to.find(
          (id) =>
            !session()
              .roster()
              .some((p) => p.id === id),
        );
        if (unknown) return failure(new Error(`There is no player "${unknown}" at this table.`));
        const status = session().prompts.ask(request, to, ASKER);
        return text(JSON.stringify(report(await untilClosed(ctx, status, wait ?? 0))));
      } catch (err) {
        return failure(err);
      }
    },
  );

  server.registerTool(
    'cancel_prompt',
    {
      title: 'Withdraw a prompt',
      description: 'Take a prompt away from the players who have not answered it yet.',
      inputSchema: { id: z.string().describe('The prompt id that `prompt` answered with.') },
    },
    ({ id }) => {
      try {
        return text(JSON.stringify(report(session().prompts.cancel(id))));
      } catch (err) {
        return failure(err);
      }
    },
  );
}

/** Listing prompts and reading the event feed. */
function registerFollowing(server: McpServer, ctx: ToolContext): void {
  const { session } = ctx;
  server.registerTool(
    'list_prompts',
    {
      title: 'List prompts',
      description:
        'Every open prompt with the answers in so far, then the most recent closed ones.',
      annotations: { readOnlyHint: true },
    },
    () => text(JSON.stringify(session().prompts.list().map(report))),
  );

  server.registerTool(
    'wait_for_events',
    {
      title: 'Wait for what happens next',
      description: [
        'What happened at the table since `since`: moves (`changed`, with who and a few words; undo and redo too), prompt answers (`answered`), prompts closing, and players joining or leaving. Returns as soon as there is something, or after `seconds` with nothing.',
        'Pass the `next` it answers as `since` next time to miss nothing. Without `since` it starts from now. Call describe_table when you need the whole table.',
      ].join(' '),
      inputSchema: {
        since: z.number().int().min(0).optional().describe('The `next` of the previous call.'),
        seconds: z
          .number()
          .min(0)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .describe(
            `How long to wait for news, up to ${MAX_WAIT_SECONDS}. Default ${DEFAULT_WAIT_SECONDS}.`,
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ since, seconds }) => {
      const page = await session().events.wait(since, (seconds ?? DEFAULT_WAIT_SECONDS) * 1000);
      return text(JSON.stringify(page));
    },
  );
}

/** Waits up to `seconds` for a prompt to close, and gives its status then. */
async function untilClosed(
  ctx: ToolContext,
  status: PromptStatus,
  seconds: number,
): Promise<PromptStatus> {
  const deadline = Date.now() + seconds * 1000;
  const events = ctx.session().events;
  let since = events.since().next;
  while (status.open && Date.now() < deadline) {
    since = (await events.wait(since, deadline - Date.now())).next;
  }
  return status;
}

/** A prompt's status as the agent reads it: who it is for, and what they answered. */
function report(status: PromptStatus) {
  const { prompt, to, answers, open } = status;
  return {
    id: prompt.id,
    kind: prompt.kind,
    text: prompt.text,
    to,
    answers,
    open,
    waitingFor: open ? to.filter((p) => !Object.hasOwn(answers, p)) : [],
  };
}
