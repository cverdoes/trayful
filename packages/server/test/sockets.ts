import type { ServerMessage } from '@trayful/core';
import WebSocket from 'ws';
import { frameText } from '../src/routes/frames.js';

/**
 * Opens a socket to a test server and collects messages; `next()` waits for the next
 * one. Player lists are kept apart in `players`, since they arrive whenever someone
 * comes or goes.
 */
export async function openSocket(
  url: string,
  origin?: string,
  headers: Record<string, string> = {},
) {
  const socket = new WebSocket(url.replace('http', 'ws') + '/ws', {
    headers,
    ...(origin ? { origin } : {}),
  });
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const players: ServerMessage[] = [];
  socket.on('message', (data) => {
    const message = JSON.parse(frameText(data)) as ServerMessage;
    if (message.type === 'players') {
      players.push(message);
      return;
    }
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    socket,
    players,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiting.push(resolve);
      }),
    /** Waits for the next message of one type, passing over the others. */
    async nextOf<T extends ServerMessage['type']>(type: T) {
      for (;;) {
        const message = await this.next();
        if (message.type === type) return message as Extract<ServerMessage, { type: T }>;
      }
    },
  };
}
