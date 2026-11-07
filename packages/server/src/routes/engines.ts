import { PlayerError } from '../play/players.js';
import { KnockError, Knocks } from '../play/knocks.js';
import type { RouteContext, TableQuery } from './context.js';

/** Engines knocking to join a table, and the host sending one away. */
export function registerEngineRoutes({
  app,
  players,
  workspace,
  target,
  hostOnly,
  connections,
}: RouteContext): void {
  const knocks = new Knocks(players);

  // An engine asks to join. The request waits for the host's answer, up to a minute and a half.
  app.post<{ Body: (TableQuery & { name?: string }) | undefined }>(
    '/api/knock',
    async (request, reply) => {
      const { project, table } = target(request.body ?? {});
      const session = await workspace.table(project, table, { create: false });
      try {
        const outcome = await knocks.knock(session, request.body?.name ?? '', request.ip);
        if (outcome.status === 'denied') {
          return await reply.code(403).send({ ...outcome, error: 'The host did not let you in.' });
        }
        if (outcome.status === 'expired') {
          return await reply
            .code(408)
            .send({ ...outcome, error: 'The host did not answer in time. Knock again later.' });
        }
        return { ...outcome, project, table };
      } catch (err) {
        if (err instanceof KnockError) return reply.code(429).send({ error: err.message });
        if (err instanceof PlayerError) return reply.code(400).send({ error: err.message });
        throw err;
      }
    },
  );

  // The host sends an engine away: its secret stops working and its connections close.
  app.delete<{ Params: { id: string } }>('/api/engines/:id', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    await workspace.dismissEngine(request.params.id);
    connections.closeAll(request.params.id, 'The host sent this engine away.');
    return { ok: true };
  });
}
