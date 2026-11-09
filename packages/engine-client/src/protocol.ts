/**
 * The messages an engine exchanges with a Trayful table, written out in full so the
 * published client needs nothing else. They mirror the server's own definitions, and
 * a test keeps the two the same.
 */

/** An `[x, y]` position on the table, in millimetres. */
export type Vec2 = [number, number];

/**
 * Where pieces go: a position, a drop area or spot such as `board/market/2`, `hand:<player>`,
 * or free room on a surface as `surface:<id>`.
 */
export type Target = Vec2 | string;

/** A stamp pressed on a spot, or text written there. */
export type Mark = { stamp: string } | { text: string };

/** One component on the table. */
export interface Piece {
  kind: 'piece';
  /** Stable component id from the inventory; a stand-in starting `hidden-` for a hidden piece. */
  id: string;
  /** The component's type in the library. */
  type: string;
  /** Its field values; a hidden piece shows only what its back shows. */
  data?: Record<string, string | number | boolean>;
  pos: Vec2;
  rot: number;
  face: 'up' | 'down';
  z: number;
  locked?: boolean;
  /** The surface it lies on; none for the Centre, or while in a stack, hand or bag. */
  surface?: string;
  /** A counter's number or the face a die shows. */
  value?: number | string;
  /** The stack holding it. */
  parent?: string;
  /** The snap spot it sits in, as `pieceId/target/index`. */
  snap?: string;
  /** The player whose hand holds it. */
  hand?: string;
  /** The bag holding it, as `pieceId/target`. */
  bag?: string;
  marks?: Record<string, Mark>;
}

/** An ordered pile of pieces, such as a deck: `items` from bottom to top. */
export interface Stack {
  kind: 'stack';
  id: string;
  name?: string;
  pos: Vec2;
  rot: number;
  z: number;
  items: string[];
  locked?: boolean;
  /** The surface it lies on; none for the Centre. */
  surface?: string;
  snap?: string;
  layout?: 'pile' | 'fan' | 'spread';
}

export type TableObject = Piece | Stack;

/** A separate play space on the table. Everyone sees every surface. */
export interface Surface {
  /** `centre` is the Centre, which every table has. */
  id: string;
  name: string;
  /** Somewhere a player can sit. */
  seat?: boolean;
  /** Who sits here. */
  player?: string;
}

/** The table as the engine may see it. */
export interface TableView {
  format: 'trayful/1';
  table: string;
  /** Always 0: the random generator's state would predict shuffles. */
  seed: number;
  rng: number;
  /** The surfaces besides the Centre, in tile order; the Centre is listed only when renamed. */
  surfaces?: readonly Surface[];
  objects: Readonly<Record<string, TableObject>>;
  /** How many pieces each player holds, by player id. */
  hands: Record<string, number>;
  /** How many pieces each bag holds, by `owner/target`. */
  bags: Record<string, number>;
}

/** A change to the table: the same commands the browser sends. */
export type Command =
  | {
      type: 'move';
      ids: string[];
      by?: Vec2;
      to?: Target;
      into?: string;
      face?: 'up' | 'down';
      /** With a position in `to`: the surface it is on. */
      surface?: string;
    }
  | { type: 'flip'; ids: string[] }
  | { type: 'rotate'; ids: string[]; steps?: number; degrees?: number }
  | { type: 'stack'; ids: string[]; onto: string }
  | {
      type: 'draw';
      from: string;
      count?: number;
      to: Target;
      face?: 'up' | 'down';
      surface?: string;
    }
  | {
      type: 'deal';
      from: string;
      to: Target | Target[];
      count?: number;
      face?: 'up' | 'down';
      surface?: string;
    }
  | { type: 'take'; id: string; to: Target; face?: 'up' | 'down'; surface?: string }
  | { type: 'layout'; id: string; layout: 'pile' | 'fan' | 'spread' }
  | { type: 'shuffle'; id: string }
  | { type: 'roll'; id: string }
  | { type: 'setValue'; id: string; value: number | string }
  | { type: 'lock'; ids: string[]; locked: boolean }
  | { type: 'mark'; at: string; stamp?: string; text?: string }
  | { type: 'erase'; at: string }
  | { type: 'addSurface'; id: string; name?: string; seat?: boolean; after?: string }
  | { type: 'editSurface'; id: string; name?: string; seat?: boolean; after?: string }
  | { type: 'removeSurface'; id: string; to?: string }
  | { type: 'sit'; surface: string; player?: string };

export type PromptKind = 'message' | 'confirm' | 'choice' | 'pick' | 'place' | 'number' | 'text';

/** What to ask players. Which fields apply depends on `kind`. */
export interface PromptRequest {
  kind: PromptKind;
  title?: string;
  text: string;
  /** For `choice`: at least two. */
  options?: { id: string; label: string }[];
  /** For `pick`: piece or stack ids. For `place`: drop areas or spots, such as `board/market/2`. */
  candidates?: string[];
  /** For `choice`, `pick` and `place`: how many to pick (default 1). For `number`: the range. */
  min?: number;
  max?: number;
  /** A piece or place to show the prompt next to, as a bubble. */
  anchor?: string;
  /** Pieces or places to light up while the prompt is open. */
  highlight?: string[];
}

/** A prompt as its players see it. */
export interface PlayerPrompt extends PromptRequest {
  id: string;
  /** Who asks, by name. */
  from: string;
  /** When it closes by itself, as an ISO date. */
  expires?: string;
}

/** `true` for a message, yes or no for a confirm, the ids picked, or what was typed. */
export type PromptAnswer = boolean | string[] | number | string;

/** Something that happened at the table, numbered by `seq`. */
export type TableEvent = { seq: number; at: string } & (
  | {
      kind: 'changed';
      change: 'apply' | 'undo' | 'redo';
      player?: string;
      name?: string;
      /** A few words, such as "drew 1 piece into their hand". */
      text: string;
      revision: number;
      /** Pieces and stacks on the table that changed. */
      objects: string[];
    }
  | { kind: 'answered'; prompt: string; player: string; answer: PromptAnswer }
  | { kind: 'prompt-closed'; prompt: string; reason: 'answered' | 'cancelled' | 'expired' }
  | { kind: 'joined' | 'left'; player: string }
);

/** Someone at the table. */
export interface PlayerInfo {
  id: string;
  name: string;
  color: string;
  kind: 'person' | 'agent';
  role: 'host' | 'guest' | 'agent' | 'engine';
  online: boolean;
}

/** Who made a change and what it was. */
export interface Activity {
  by: 'agent' | 'person';
  player?: string;
  name?: string;
  text: string;
  motion?: { kind: 'roll' | 'shuffle'; ids: string[] };
}

/** What an engine sends. */
export type EngineMessage =
  | { type: 'command'; command: Command; requestId?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | {
      type: 'ask';
      to: string[] | 'everyone';
      prompt: PromptRequest;
      until?: 'all' | 'first';
      expires?: number;
      requestId?: string;
    }
  | { type: 'cancel-prompt'; prompt: string }
  | { type: 'follow'; since?: number };

/** What the table sends an engine. Messages meant for browsers are listed so they can be ignored. */
export type TableMessage =
  | {
      type: 'state';
      state: TableView;
      revision: number;
      canUndo: boolean;
      canRedo: boolean;
      activity?: Activity;
    }
  | { type: 'error'; message: string; requestId?: string }
  | { type: 'done'; requestId: string }
  | { type: 'players'; players: PlayerInfo[]; you?: string }
  | { type: 'prompts'; prompts: PlayerPrompt[] }
  | { type: 'asked'; prompt: PlayerPrompt; to: string[]; requestId?: string }
  | { type: 'events'; events: TableEvent[]; next: number; missed?: boolean }
  | { type: 'project'; view: { project: string; name: string; table: string; version: number } }
  | { type: 'problems'; problems: string[] }
  | { type: 'snapshot-request'; id: string }
  | { type: 'render-request'; id: string; component: unknown };
