import type { Assets, ComponentType } from '@trayful/formats/browser';
import type { Command } from '../commands/index.js';
import type { TableView } from './privacy.js';
import type { TableEvent } from './events.js';
import type { PlayerPrompt, PromptAnswer, PromptRequest } from './prompts.js';

/**
 * Messages between a Trayful server and its clients (the browser table today,
 * MCP and remote players later). Sent as JSON over a WebSocket at `/ws`.
 */
export type ClientMessage =
  /** A change to the table. With a `requestId`, the sender hears `done` or an `error` back. */
  | { type: 'command'; command: Command; requestId?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  /**
   * Replace the table with a fresh one, set up by the project's default setup or the
   * one named (`false` for straight out of the box). Undoable.
   */
  | { type: 'reset'; seed?: number; setup?: string | false }
  /** Answer to a `snapshot-request`: the whole table as a base64 PNG, or why it failed. */
  | { type: 'snapshot'; id: string; png?: string; error?: string }
  /** A player's answer to a prompt they were shown. */
  | { type: 'answer'; prompt: string; answer: PromptAnswer }
  /**
   * An engine asks players something: player ids, or `everyone` (every person at the
   * table). Answered with `asked`, or an `error` with the same `requestId`.
   */
  | {
      type: 'ask';
      to: string[] | 'everyone';
      prompt: PromptRequest;
      /** `all` (default) waits for everyone it is for; `first` closes on the first answer. */
      until?: 'all' | 'first';
      /** Seconds until it closes by itself. */
      expires?: number;
      requestId?: string;
    }
  /** An engine withdraws a prompt it asked. */
  | { type: 'cancel-prompt'; prompt: string }
  /**
   * An engine follows what happens at the table: the events after `since` (none
   * before now when left out), then each new one as an `events` message.
   */
  | { type: 'follow'; since?: number };

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
  /** A command sent with a `requestId` was applied. */
  | { type: 'done'; requestId: string }
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
  | { type: 'players'; players: PlayerInfo[]; you?: string }
  /**
   * The prompts this player has still to answer, oldest first. Sent on connect and
   * whenever one is asked, answered or withdrawn; an empty list clears them.
   */
  | { type: 'prompts'; prompts: PlayerPrompt[] }
  /** An engine's prompt was asked, as the players it is for are shown it. */
  | { type: 'asked'; prompt: PlayerPrompt; to: string[]; requestId?: string }
  /**
   * For an engine following the table: what happened, and the `next` to pass as `since`
   * when it reconnects. `missed` says older events were dropped before it caught up.
   */
  | { type: 'events'; events: TableEvent[]; next: number; missed?: boolean };

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
  /** Pieces every viewer should see move, such as dice that were rolled. */
  motion?: Motion;
}

/**
 * Something tables show moving rather than just changing: dice tumbling, piles being
 * riffled. Only for the eye: the state message carries the outcome. Each viewer gets
 * only the ids they can see.
 */
export interface Motion {
  kind: 'roll' | 'shuffle';
  /** The dice rolled, or the stacks shuffled. */
  ids: string[];
}

/** A player as other players see them. */
export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  kind: 'person' | 'agent';
  /** Engines are programs the host let in to run the game. */
  role: 'host' | 'guest' | 'agent' | 'engine';
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
