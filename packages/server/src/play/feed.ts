import type { EventBody, FeedPage, TableEvent } from '@trayful/core';

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
  private listeners = new Set<(event: TableEvent) => void>();

  push(body: EventBody): void {
    const event: TableEvent = { ...body, seq: ++this.seq, at: new Date().toISOString() };
    this.events.push(event);
    if (this.events.length > KEEP) this.events.splice(0, this.events.length - KEEP);
    for (const wake of [...this.waiting]) wake();
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Hands every event to a listener as it happens, until the returned function is called. */
  listen(listener: (event: TableEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
    this.listeners.clear();
    for (const wake of [...this.waiting]) wake();
  }
}
