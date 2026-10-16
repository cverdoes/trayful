// What the MCP tools share: the active table, running commands as the agent, and reply helpers.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  applyCommand,
  onTable,
  summarize,
  type Catalog,
  type Command,
  type TableEngine,
  type TableState,
} from '@trayful/core';
import { z } from 'zod';
import { AGENT_PLAYER } from '../players.js';
import type { TableSession } from '../session.js';
import type { Workspace } from '../workspace.js';

/** The workspace, and the active table at the moment a tool runs. */
export interface ToolContext {
  workspace: Workspace;
  session: () => TableSession;
  engine: () => TableEngine;
  types: () => Catalog;
  /** Runs commands for the agent, all or nothing, and reports which objects changed. */
  play: (activity: string, commands: Command[]) => CallToolResult;
  /** The objects that changed between two states, as a tool's JSON reply. */
  changes: (before: TableState, after: TableState) => string;
}

export function toolContext(workspace: Workspace): ToolContext {
  const session = () => workspace.active;
  const engine = () => workspace.active.engine;
  const types = () => workspace.active.project.types;

  const changes = (before: TableState, after: TableState): string => {
    const changed = Object.values(after.objects)
      .filter(
        (o) =>
          before.objects[o.id] !== o &&
          (onTable(o) || (o.kind === 'piece' && o.hand === AGENT_PLAYER)),
      )
      .map((o) => summarize(after, types(), o));
    const removed = Object.keys(before.objects).filter((id) => !after.objects[id]);
    return JSON.stringify({ changed, ...(removed.length ? { removed } : {}) });
  };

  const play = (activity: string, commands: Command[]): CallToolResult => {
    const before = engine().state;
    try {
      // Try every command first, so a tool call changes all or nothing. Only a throw
      // matters here; the resulting state is thrown away.
      let state = before;
      for (const command of commands) state = applyCommand(state, command, types());
      for (const command of commands) session().checkReach(command, AGENT_PLAYER);
    } catch (err) {
      return failure(err);
    }
    session().asAgent(activity, () => {
      for (const command of commands) engine().dispatch(command, AGENT_PLAYER);
    });
    return text(changes(before, engine().state));
  };

  return { workspace, session, engine, types, play, changes };
}

export function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

export function failure(err: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
  };
}

/** `n` with the word for one or for many, such as "1 card" or "3 dice". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// Input schemas several tools share --------------------------------------------

export const Pos = z
  .tuple([z.number(), z.number()])
  .describe('A table position `[x, y]` in millimetres; y grows downwards.');
export const Ids = z
  .array(z.string())
  .min(1)
  .describe('Object ids, from describe_table or query_objects.');
export const Face = z.enum(['up', 'down']);
export const Target = z
  .union([
    Pos,
    z
      .string()
      .describe(
        "A drop area from describe_table: `board/target/index` for one spot, or `board/target` for its free spots in order (or its free area); or `hand:<player>` for a player's private hand.",
      ),
  ])
  .describe(
    'A position `[x, y]` in mm, a drop area such as `main-board/market/2`, or a hand such as `hand:claude`.',
  );
export const tableName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .describe('Table name: lowercase letters, digits and dashes, such as `playtest-2`.');
export const projectParam = z
  .string()
  .optional()
  .describe('Project id from list_projects. Default: the project of the active table.');
