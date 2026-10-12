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
  /** Replace the table with a fresh one straight out of the box. Undoable. */
  | { type: 'reset'; seed?: number }
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
  | { type: 'snapshot-request'; id: string };

export interface Activity {
  by: 'agent';
  /** What happened, in a few words, such as "dealt 5 cards". */
  text: string;
}

/** What a client needs to draw a project's components, served at `/api/project`. */
export interface ProjectView {
  name: string;
  table: string;
  palette: Record<string, string>;
  types: Record<string, ComponentType>;
}
