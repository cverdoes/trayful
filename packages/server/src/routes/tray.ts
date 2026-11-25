import { importCsv, moveToCsv, readTray, saveTray, type Tray } from '../projects/tray.js';
import { projectFor, type ProjectQuery } from './authoring.js';
import type { RouteContext } from './context.js';

/** A CSV file can hold a few thousand rows; allow more than the default body size. */
const CSV_BODY_LIMIT = 8 * 1024 * 1024;

/** The Tray: what is in the box of one component, edited by the host in the designer. */
export function registerTrayRoutes(ctx: RouteContext): void {
  const { app, hostOnly } = ctx;
  app.get<{ Params: { id: string }; Querystring: ProjectQuery }>(
    '/api/tray/:id',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { workspace, projectId } = projectFor(ctx, request);
      return readTray(workspace, projectId, request.params.id);
    },
  );

  app.put<{ Params: { id: string }; Querystring: ProjectQuery; Body: Partial<Tray> | undefined }>(
    '/api/tray/:id',
    { bodyLimit: CSV_BODY_LIMIT },
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { workspace, projectId } = projectFor(ctx, request);
      const { entries, tables = {} } = request.body ?? {};
      if (!Array.isArray(entries)) {
        return reply.code(400).send({ error: 'Send the entries as "entries".' });
      }
      return saveTray(workspace, projectId, request.params.id, { entries, tables });
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: ProjectQuery;
    Body: { name?: unknown; text?: unknown } | undefined;
  }>('/api/tray/:id/csv', { bodyLimit: CSV_BODY_LIMIT }, async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { workspace, projectId } = projectFor(ctx, request);
    const { name, text } = request.body ?? {};
    if (typeof name !== 'string' || typeof text !== 'string') {
      return reply.code(400).send({ error: 'Send the file as "name" and "text".' });
    }
    return importCsv(workspace, projectId, request.params.id, { name, text });
  });

  app.post<{
    Params: { id: string };
    Querystring: ProjectQuery;
    Body: { entry?: unknown } | undefined;
  }>('/api/tray/:id/to-csv', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { workspace, projectId } = projectFor(ctx, request);
    const { entry } = request.body ?? {};
    if (typeof entry !== 'number' || !Number.isInteger(entry)) {
      return reply.code(400).send({ error: 'Send the place of the entry as "entry".' });
    }
    return moveToCsv(workspace, projectId, request.params.id, entry);
  });
}
