import type { ClientMessage, ServerMessage } from '@trayful/core';
import { isTrustedOrigin } from '../access.js';
import { frameText } from '../frames.js';
import type { RouteContext, TableQuery } from './context.js';

/** The live connection a browser plays a table over. */
export function registerSocket({
  app,
  workspace,
  shareBases,
  sessionFor,
  identify,
}: RouteContext): void {
  app.get<{ Querystring: TableQuery }>('/ws', { websocket: true }, (socket, request) => {
    // Only Trayful pages may drive the table; this stops other websites open in the
    // browser from connecting to the server.
    if (!isTrustedOrigin(request, shareBases)) {
      socket.close(1008, 'Origin not allowed');
      return;
    }
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    Promise.all([sessionFor(request.query), identify(request)]).then(
      ([session, { player }]) => {
        const viewer = player?.id;
        send(session.stateMessage(viewer));
        const problems = workspace.entry(session.projectId).problems;
        if (problems.length) send({ type: 'problems', problems });
        const unsubscribe = session.subscribe(send, viewer);
        socket.on('message', (data) => {
          let message: ClientMessage | null;
          try {
            message = JSON.parse(frameText(data)) as ClientMessage | null;
          } catch {
            send({ type: 'error', message: 'Messages must be JSON.' });
            return;
          }
          // Watching needs only an invite; playing needs a name.
          if (!viewer && message?.type !== 'snapshot') {
            send({ type: 'error', message: 'Join the table to play.' });
            return;
          }
          const error = session.handle(message, viewer);
          if (error) send(error);
        });
        socket.on('close', unsubscribe);
      },
      (err: unknown) => {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
        socket.close(1008, 'No such table');
      },
    );
  });
}
