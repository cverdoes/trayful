import type { PromptAnswer } from './prompts.js';

/** Something that happened at a table, as whatever runs the game hears about it. */
export type TableEvent = { seq: number; at: string } & EventBody;

/** What happened, before the feed numbers it. Never names a hidden piece. */
export type EventBody =
  | {
      kind: 'changed';
      /** `apply` for a move, `undo` and `redo` when someone stepped back or forward. */
      change: 'apply' | 'undo' | 'redo';
      player?: string;
      name?: string;
      /** The same few words people watching see, such as "drew 1 piece into their hand". */
      text: string;
      revision: number;
      /** The pieces and stacks on the table that changed, as anyone watching sees them. */
      objects: string[];
    }
  | { kind: 'answered'; prompt: string; player: string; answer: PromptAnswer }
  | { kind: 'prompt-closed'; prompt: string; reason: 'answered' | 'cancelled' | 'expired' }
  | { kind: 'joined' | 'left'; player: string };

/** What a reader gets: the events after the one it saw last, and where to go on from. */
export interface FeedPage {
  events: TableEvent[];
  /** Pass this as `since` next time. */
  next: number;
  /** True when older events were dropped before this reader caught up. */
  missed?: boolean;
}
