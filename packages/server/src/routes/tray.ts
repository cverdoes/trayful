import { importCsv, readTray, saveTray, type Tray } from '../tray.js';
import { projectOf, type ProjectQuery } from './authoring.js';
import type { RouteContext } from './context.js';

/** A CSV file can hold a few thousand rows; allow more than the default body size. */
const CSV_BODY_LIMIT = 8 * 1024 * 1024;

/** The Tray: what is in the box of one component, edited by the host in the designer. */
export function registerTrayRoutes(ctx: RouteContext): void {
  const { app, workspace, hostOnly } = ctx;
  app.get<{ Params: { id: string }; Querystring: ProjectQuery }>(
    '/api/tray/:id',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      return readTray(workspace, projectOf(ctx, request.query), request.params.id);
    },
  );

  app.put<{ Params: { id: string }; Querystring: ProjectQuery; Body: Partial<Tray> | undefined }>(
    '/api/tray/:id',
    { bodyLimit: CSV_BODY_LIMIT },
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { entries, tables = {} } = request.body ?? {};
      if (!Array.isArray(entries)) {
        return reply.code(400).send({ error: 'Send the entries as "entries".' });
      }
      const projectId = projectOf(ctx, request.query);
      return saveTray(workspace, projectId, request.params.id, { entries, tables });
    },
  );

  app.post<{
    Params: { id: string };
    Querystring: ProjectQuery;
    Body: { name?: unknown; text?: unknown } | undefined;
  }>('/api/tray/:id/csv', { bodyLimit: CSV_BODY_LIMIT }, async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { name, text } = request.body ?? {};
    if (typeof name !== 'string' || typeof text !== 'string') {
      return reply.code(400).send({ error: 'Send the file as "name" and "text".' });
    }
    const projectId = projectOf(ctx, request.query);
    return importCsv(workspace, projectId, request.params.id, { name, text });
  });
}
