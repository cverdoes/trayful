import type { Assets, ComponentType } from '@trayful/formats/browser';
import type { Command } from './commands.js';
import type { TableView } from './privacy.js';

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
      /** The table as this client's player may see it: other hands and face-down faces hidden. */
      state: TableView;
      /** Increases with every change, so clients can ignore stale messages. */
      revision: number;
      canUndo: boolean;
      canRedo: boolean;
      /** Who made this change and what it was, so people watching can follow along. */
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
  | { type: 'problems'; problems: string[] }
  /** Who is at the table. Sent on connect and whenever someone joins, leaves or renames. */
  | { type: 'players'; players: PlayerInfo[]; you?: string };

/** What to draw for `render-request`: a type, with field values for its `{{field}}` placeholders. */
export interface RenderRequest {
  type: string;
  data?: Record<string, string | number | boolean>;
  /** Both sides side by side (default), or just one. */
  face?: 'up' | 'down' | 'both';
}

export interface Activity {
  by: 'agent' | 'person';
  /** The player who acted, and their name. */
  player?: string;
  name?: string;
  /** What happened, in a few words, such as "dealt 5 cards". Never names hidden pieces. */
  text: string;
  /** Pieces every viewer should see animate, such as dice that were rolled. */
  motion?: Motion;
}

/**
 * Something tables show moving rather than just changing. Only for the eye: the
 * state message carries the outcome. Each viewer gets only the ids they can see.
 */
export interface Motion {
  kind: 'roll';
  ids: string[];
}

/** A player as other players see them. */
export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  kind: 'person' | 'agent';
  role: 'host' | 'guest' | 'agent';
  /** Whether they have this table open right now. */
  online: boolean;
}

/** What a client needs to draw a project's components, served at `/api/project`. */
export interface ProjectView {
  /** Project id within the workspace: its folder name. */
  project: string;
  /** Increases every time the project files are reloaded, so images can be fetched afresh. */
  version: number;
  name: string;
  table: string;
  /** The images and colours faces refer to by name. */
  assets: Assets;
  /** True while the project is in the first file format, which the designer does not change. */
  legacy: boolean;
  types: Record<string, ComponentType>;
  /** Setup names, and the one a new table starts from. */
  setups: string[];
  setup?: string;
}
