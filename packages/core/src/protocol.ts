import type { ComponentType } from '@trayful/formats/browser';
import type { Command } from './commands.js';
import type { TableState } from './state.js';

/**
 * Messages between a Trayful server and its clients (the browser table today,
 * MCP and remote players later). Sent as JSON over a WebSocket at `/ws`.
 */
export type ClientMessage =
  | { type: 'command'; command: Command; requestId?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  /**
   * Replace the table with a fresh one, set up by the project's default setup or the
   * one named (`false` for straight out of the box). Undoable.
   */
  | { type: 'reset'; seed?: number; setup?: string | false }
  /** Answer to a `snapshot-request`: the whole table as a base64 PNG, or why it failed. */
  | { type: 'snapshot'; id: string; png?: string; error?: string };

export type ServerMessage =
  | {
      type: 'state';
      state: TableState;
      /** Increases with every change, so clients can ignore stale messages. */
      revision: number;
      canUndo: boolean;
      canRedo: boolean;
      /** Set when an agent made this change, so people watching can see what happened. */
      activity?: Activity;
    }
  | { type: 'error'; message: string; requestId?: string }
  /** Asks a browser to render the table to a PNG and answer with a `snapshot` message. */
  | { type: 'snapshot-request'; id: string }
  /**
   * Asks a browser to draw one component (both sides) and answer with a `snapshot`
   * message, so an agent designing a type can see it.
   */
  | { type: 'render-request'; id: string; component: RenderRequest }
  /** The project files changed and loaded cleanly: redraw with these definitions. */
  | { type: 'project'; view: ProjectView }
  /** The project files changed but have errors; the table keeps the last good version. */
  | { type: 'problems'; problems: string[] };

/** What to draw for `render-request`: a type, with field values for its `{{field}}` placeholders. */
export interface RenderRequest {
  type: string;
  data?: Record<string, string | number | boolean>;
  /** Both sides side by side (default), or just one. */
  face?: 'up' | 'down' | 'both';
}

export interface Activity {
  by: 'agent';
  /** What happened, in a few words, such as "dealt 5 cards". */
  text: string;
}

/** What a client needs to draw a project's components, served at `/api/project`. */
export interface ProjectView {
  /** Project id within the workspace: its folder name. */
  project: string;
  /** Increases every time the project files are reloaded, so images can be fetched afresh. */
  version: number;
  name: string;
  table: string;
  palette: Record<string, string>;
  types: Record<string, ComponentType>;
  /** Setup names, and the one a new table starts from. */
  setups: string[];
  setup?: string;
}
