import { libraryFiles, removeType, upsertType } from '../authoring.js';
import type { RouteContext } from './context.js';

interface ProjectQuery {
  project?: string;
}

/** Designing component types in the browser: the host's library, saved through the authoring module. */
export function registerAuthoringRoutes({ app, workspace, hostOnly }: RouteContext): void {
  const projectOf = (query: ProjectQuery) => query.project ?? workspace.active.projectId;

  // Which file each type lives in, and the version of each file, for saving without conflicts.
  app.get<{ Querystring: ProjectQuery }>('/api/library', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return libraryFiles(workspace, projectOf(request.query));
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
    const projectId = projectOf(request.query);
    const result = await upsertType(workspace, projectId, definition, { file, baseHash });
    return { file: result.file, created: result.created, ...result.library };
  });

  app.delete<{ Params: { id: string }; Querystring: ProjectQuery }>(
    '/api/types/:id',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const projectId = projectOf(request.query);
      await removeType(workspace, projectId, request.params.id);
      return libraryFiles(workspace, projectId);
    },
  );
}
