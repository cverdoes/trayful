import { randomUUID } from 'node:crypto';
import type { ServerMessage } from '@trayful/core';

/** A snapshot could not be taken, usually because no browser has the table open. */
export class SnapshotError extends Error {}

interface Waiting {
  resolve: (png: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  /** Browsers that may still answer; one that cannot draw it leaves the others to try. */
  pending: number;
}

/**
 * Pictures an agent asked a watching browser to draw, waiting for the first browser
 * to send one. A browser that cannot draw it, such as one not showing the surface
 * asked for, says why; the request fails only when every browser has said so. The
 * table session sends the requests and passes the answers back here.
 */
export class PictureRequests {
  private waiting = new Map<string, Waiting>();

  constructor(
    private readonly broadcast: (message: ServerMessage) => void,
    private readonly watchers: () => number,
  ) {}

  /** Sends a request to every watching browser, and resolves with the first PNG back. */
  request(message: (id: string) => ServerMessage, timeoutMs: number): Promise<Buffer> {
    const watchers = this.watchers();
    if (watchers === 0) {
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
      this.waiting.set(id, { resolve, reject, timer, pending: watchers });
      this.broadcast(message(id));
    });
  }

  /** A browser's answer: the picture as base64, or why it could not draw it. */
  answer(id: string, png?: string, error?: string): void {
    const waiting = this.waiting.get(id);
    if (!waiting) return; // Another browser answered first, or it timed out.
    waiting.pending -= 1;
    if (!png && waiting.pending > 0) return;
    this.waiting.delete(id);
    clearTimeout(waiting.timer);
    if (png) waiting.resolve(Buffer.from(png, 'base64'));
    else waiting.reject(new SnapshotError(error ?? 'The browser could not draw the table.'));
  }

  /** Gives up on every picture still awaited. */
  cancelAll(reason: string): void {
    for (const [id, waiting] of [...this.waiting]) {
      waiting.pending = 1;
      this.answer(id, undefined, reason);
    }
  }
}
