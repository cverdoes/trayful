import type { FastifyReply, FastifyRequest } from 'fastify';
import { libraryFiles, removeType, upsertType } from '../projects/authoring.js';
import { migrateFolder } from '../projects/migrate.js';
import { renameField, renameType } from '../projects/renaming.js';
import type { Workspace } from '../projects/workspace.js';
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

/** The workspace a request is for, and the project it names or else the active one. */
export function projectFor(
  { spaceOf }: RouteContext,
  request: FastifyRequest,
): { workspace: Workspace; projectId: string } {
  const { workspace } = spaceOf(request);
  const { project } = request.query as ProjectQuery;
  return { workspace, projectId: project ?? workspace.active.projectId };
}

function registerTypeRoutes(ctx: RouteContext): void {
  const { app, hostOnly } = ctx;
  // Which file each type lives in, and the version of each file, for saving without conflicts.
  app.get<{ Querystring: ProjectQuery }>('/api/library', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { workspace, projectId } = projectFor(ctx, request);
    return libraryFiles(workspace, projectId);
  });

  app.put<{
    Params: { id: string };
    Querystring: ProjectQuery;
    Body: { definition?: { id?: unknown }; file?: string; baseHash?: string } | undefined;
  }>('/api/types/:id', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { workspace, projectId } = projectFor(ctx, request);
    const { definition, file, baseHash } = request.body ?? {};
    if (definition === undefined) {
      return reply.code(400).send({ error: 'Send the type as "definition".' });
    }
    if (definition.id !== request.params.id) {
      return reply.code(400).send({ error: 'The type in the request has a different id.' });
    }
    const result = await upsertType(workspace, projectId, definition, { file, baseHash });
    return { file: result.file, created: result.created, ...result.library };
  });

  app.delete<{ Params: { id: string }; Querystring: ProjectQuery }>(
    '/api/types/:id',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { workspace, projectId } = projectFor(ctx, request);
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
  const { app, hostOnly } = ctx;
  app.post<{ Params: { id: string }; Querystring: ProjectQuery; Body: RenameBody | undefined }>(
    '/api/types/:id/rename',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { workspace, projectId } = projectFor(ctx, request);
      const to = newName(request.body, reply);
      if (to === undefined) return;
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
    const { workspace, projectId } = projectFor(ctx, request);
    const to = newName(request.body, reply);
    if (to === undefined) return;
    const { id, field: from } = request.params;
    const { field } = await renameField(workspace, projectId, id, { from, to });
    return { field, ...(await libraryFiles(workspace, projectId)) };
  });
}

/** Moving a project in the first file format to the current one, so it can be designed. */
function registerMigrateRoute(ctx: RouteContext): void {
  const { app, hostOnly } = ctx;
  app.post<{ Querystring: ProjectQuery }>('/api/migrate', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { workspace, projectId } = projectFor(ctx, request);
    const files = await migrateFolder(workspace.entry(projectId).dir);
    await workspace.reload(projectId);
    return { files };
  });
}
