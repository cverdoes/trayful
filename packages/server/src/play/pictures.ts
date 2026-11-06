import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@trayful/core';

/** A snapshot could not be taken, usually because no browser has the table open. */
export class SnapshotError extends Error {}

interface Waiting {
  resolve: (png: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Pictures an agent asked a watching browser to draw, waiting for the first browser
 * to answer. The table session sends the requests and passes the answers back here.
 */
export class PictureRequests {
  private waiting = new Map<string, Waiting>();

  constructor(
    private readonly broadcast: (message: ServerMessage) => void,
    private readonly watchers: () => number,
  ) {}

  /** Sends a request to every watching browser, and resolves with the first PNG back. */
  request(message: (id: string) => ServerMessage, timeoutMs: number): Promise<Buffer> {
    if (this.watchers() === 0) {
      return Promise.reject(
        new SnapshotError(
          'No browser has the table open, so there is nothing to draw the picture with. Open the table in a browser first.',
        ),
      );
    }
    const id = randomUUID();
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new SnapshotError('The browser did not send the picture in time.'));
      }, timeoutMs);
      this.waiting.set(id, { resolve, reject, timer });
      this.broadcast(message(id));
    });
  }

  /** A browser's answer: the picture as base64, or why it could not draw it. */
  answer(id: string, png?: string, error?: string): void {
    const waiting = this.waiting.get(id);
    if (!waiting) return; // Another browser answered first, or it timed out.
    this.waiting.delete(id);
    clearTimeout(waiting.timer);
    if (png) waiting.resolve(Buffer.from(png, 'base64'));
    else waiting.reject(new SnapshotError(error ?? 'The browser could not draw the table.'));
  }

  /** Gives up on every picture still awaited. */
  cancelAll(reason: string): void {
    for (const id of [...this.waiting.keys()]) this.answer(id, undefined, reason);
  }
}
