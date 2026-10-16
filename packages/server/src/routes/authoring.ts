import type { FastifyReply } from 'fastify';
import { libraryFiles, removeType, upsertType } from '../authoring.js';
import { migrateFolder } from '../migrate.js';
import { renameField, renameType } from '../renaming.js';
import type { RouteContext } from './context.js';

export interface ProjectQuery {
  project?: string;
}

/** The body of a rename: the new id or name. */
export interface RenameBody {
  to?: unknown;
}

/** Designing component types in the browser: the host's library, saved through the authoring module. */
export function registerAuthoringRoutes(ctx: RouteContext): void {
  registerTypeRoutes(ctx);
  registerRenameRoutes(ctx);
  registerMigrateRoute(ctx);
}

export const projectOf = ({ workspace }: RouteContext, query: ProjectQuery) =>
  query.project ?? workspace.active.projectId;

function registerTypeRoutes(ctx: RouteContext): void {
  const { app, workspace, hostOnly } = ctx;
  // Which file each type lives in, and the version of each file, for saving without conflicts.
  app.get<{ Querystring: ProjectQuery }>('/api/library', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return libraryFiles(workspace, projectOf(ctx, request.query));
  });

  app.put<{
    Params: { id: string };
    Querystring: ProjectQuery;
    Body: { definition?: { id?: unknown }; file?: string; baseHash?: string } | undefined;
  }>('/api/types/:id', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { definition, file, baseHash } = request.body ?? {};
    if (definition === undefined) {
      return reply.code(400).send({ error: 'Send the type as "definition".' });
    }
    if (definition.id !== request.params.id) {
      return reply.code(400).send({ error: 'The type in the request has a different id.' });
    }
    const projectId = projectOf(ctx, request.query);
    const result = await upsertType(workspace, projectId, definition, { file, baseHash });
    return { file: result.file, created: result.created, ...result.library };
  });

  app.delete<{ Params: { id: string }; Querystring: ProjectQuery }>(
    '/api/types/:id',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const projectId = projectOf(ctx, request.query);
      await removeType(workspace, projectId, request.params.id);
      return libraryFiles(workspace, projectId);
    },
  );
}

/** The new name a rename asks for, or a 400 reply when it gives none. */
export function newName(body: RenameBody | undefined, reply: FastifyReply): string | undefined {
  if (typeof body?.to === 'string') return body.to;
  void reply.code(400).send({ error: 'Send the new name as "to".' });
  return undefined;
}

/** Renaming types and fields, with every reference to them, as one change to the files. */
function registerRenameRoutes(ctx: RouteContext): void {
  const { app, workspace, hostOnly } = ctx;
  app.post<{ Params: { id: string }; Querystring: ProjectQuery; Body: RenameBody | undefined }>(
    '/api/types/:id/rename',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const to = newName(request.body, reply);
      if (to === undefined) return;
      const projectId = projectOf(ctx, request.query);
      const { id } = await renameType(workspace, projectId, request.params.id, to);
      return { id, ...(await libraryFiles(workspace, projectId)) };
    },
  );

  app.post<{
    Params: { id: string; field: string };
    Querystring: ProjectQuery;
    Body: RenameBody | undefined;
  }>('/api/types/:id/fields/:field/rename', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const to = newName(request.body, reply);
    if (to === undefined) return;
    const projectId = projectOf(ctx, request.query);
    const { id, field: from } = request.params;
    const { field } = await renameField(workspace, projectId, id, { from, to });
    return { field, ...(await libraryFiles(workspace, projectId)) };
  });
}

/** Moving a project in the first file format to the current one, so it can be designed. */
function registerMigrateRoute(ctx: RouteContext): void {
  const { app, workspace, hostOnly } = ctx;
  app.post<{ Querystring: ProjectQuery }>('/api/migrate', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const projectId = projectOf(ctx, request.query);
    const files = await migrateFolder(workspace.entry(projectId).dir);
    await workspace.reload(projectId);
    return { files };
  });
}
