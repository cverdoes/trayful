import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuthoringTools } from './mcp/authoring.js';
import { toolContext } from './mcp/context.js';
import { registerPlayTools } from './mcp/play.js';
import { registerReadingTools } from './mcp/reading.js';
import { registerResources } from './mcp/resources.js';
import { registerTableTools } from './mcp/tables.js';
import { AGENT_PLAYER } from './players.js';
import type { Workspace } from './workspace.js';

export interface McpOptions {
  /** Where people can watch the table, mentioned to the agent. */
  url?: string;
}

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
        `You play as the player "${AGENT_PLAYER}". Each player has a private hand that only they see: \`hand:${AGENT_PLAYER}\` is yours, \`hand:<player>\` gives a piece to someone else. Move a piece from your hand to a position or spot to play it (face up unless you say \`face: "down"\`). Other players' hands are never shown to you, not even with reveal.`,
        'To design components, read trayful://docs (HOWTO guides and the format reference), then use upsert_type, set_inventory and add_asset; render_component shows a type as people will see it. Edits are checked and undone if they would break the project.',
        'Every change goes into the same history as the people at the table, but each player undoes only their own changes, you included. Trayful does not know the rules; you bring them.',
      ].join('\n'),
    },
  );
  const ctx = toolContext(workspace);
  registerReadingTools(server, ctx);
  registerPlayTools(server, ctx);
  registerTableTools(server, ctx);
  registerAuthoringTools(server, ctx);
  registerResources(server, ctx);
  return server;
}
