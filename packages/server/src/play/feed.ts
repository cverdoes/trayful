import type { PromptAnswer } from '@trayful/core';

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
    }
  | { kind: 'answered'; prompt: string; player: string; answer: PromptAnswer }
  | { kind: 'prompt-closed'; prompt: string; reason: 'answered' | 'cancelled' }
  | { kind: 'joined' | 'left'; player: string };

/** What a reader gets: the events after the one it saw last, and where to go on from. */
export interface FeedPage {
  events: TableEvent[];
  /** Pass this as `since` next time. */
  next: number;
  /** True when older events were dropped before this reader caught up. */
  missed?: boolean;
}

/** How many events a table remembers. A reader further behind is told it missed some. */
const KEEP = 500;

/**
 * The ordered list of what happens at one table, so an agent or program running the
 * game can follow along and pick up where it left off. Readers may wait for news.
 */
export class EventFeed {
  private events: TableEvent[] = [];
  private seq = 0;
  private waiting = new Set<() => void>();

  push(body: EventBody): void {
    this.events.push({ ...body, seq: ++this.seq, at: new Date().toISOString() });
    if (this.events.length > KEEP) this.events.splice(0, this.events.length - KEEP);
    for (const wake of [...this.waiting]) wake();
  }

  /** The events after `since`; with no `since`, none, and where the feed stands now. */
  since(since?: number): FeedPage {
    if (since === undefined) return { events: [], next: this.seq };
    const events = this.events.filter((e) => e.seq > since);
    const missed = since < this.seq && (events[0]?.seq ?? this.seq + 1) > since + 1;
    return { events, next: this.seq, ...(missed ? { missed } : {}) };
  }

  /** Like `since`, but waits up to `ms` for something to happen when nothing has yet. */
  async wait(since: number | undefined, ms: number): Promise<FeedPage> {
    const from = since ?? this.seq;
    if (this.seq > from || ms <= 0) return this.since(from);
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiting.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiting.add(wake);
    });
    return this.since(from);
  }

  /** Lets every waiting reader go, such as when the table closes. */
  close(): void {
    for (const wake of [...this.waiting]) wake();
  }
}
