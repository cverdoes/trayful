import { allowed, caller, isLocalRequest } from '../play/access.js';
import { ProjectLoadError } from '../play/session.js';
import type { RouteContext, TableQuery } from './context.js';

/** Projects and tables: viewing them, and the host's table menu. */
export function registerTableRoutes(ctx: RouteContext): void {
  registerProjectViews(ctx);
  registerTableMenu(ctx);
}

/** The projects, a table and its project as the browser loads them. */
function registerProjectViews({
  app,
  players,
  workspace,
  identify,
  sessionFor,
  hostOnly,
}: RouteContext): void {
  app.get('/api/health', (request) => {
    // A git-backed Trayful waits with no project until a repository is connected.
    if (!workspace.ready) return { ok: true, waiting: true };
    return {
      ok: true,
      project: workspace.active.project.manifest.name,
      table: workspace.active.tableName,
      ...(isLocalRequest(request)
        ? { projectDir: workspace.active.project.dir, root: workspace.root }
        : {}),
    };
  });
  app.get('/api/projects', async (request) => {
    const who = caller(request, players);
    const projects = await Promise.all(
      workspace.projects().map(async (entry) => ({
        id: entry.id,
        name: entry.project?.manifest.name ?? entry.id,
        problems: entry.problems,
        tables: (entry.project ? await workspace.tables(entry.id) : []).filter((t) =>
          allowed(who, entry.id, t),
        ),
      })),
    );
    // Guests see only the tables they were invited to.
    return who.local ? projects : projects.filter((p) => p.tables.length);
  });
  app.get<{ Querystring: TableQuery }>('/api/project', async (request) =>
    (await sessionFor(request.query)).view(),
  );
  app.get<{ Querystring: TableQuery }>('/api/table', async (request) => {
    const { player } = await identify(request);
    return (await sessionFor(request.query)).viewFor(player?.id);
  });
  // Every component with its text, for print-and-play: the host's view only.
  app.get<{ Querystring: { project?: string } }>('/api/components', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    return workspace.project(request.query.project).components;
  });
}

/** New projects, and new, duplicated and deleted tables, for the table menu in the browser. */
function registerTableMenu({ app, workspace, hostOnly, git }: RouteContext): void {
  app.post<{ Body: { name?: string } | undefined }>('/api/projects', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const name = request.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: 'Give the new project a name.' });
    const folder = git?.repository.settings?.path;
    if (workspace.single && folder !== undefined) {
      // The workspace's own message names a folder of the clone, which means nothing here.
      throw new ProjectLoadError(
        `Trayful works on the one project in ${folder ? `"${folder}"` : 'the top folder'} of the repository. To have several, start it with a new data folder connected to the folder that holds them.`,
      );
    }
    const entry = await workspace.createProject(name);
    return { id: entry.id, name };
  });

  app.post<{
    Body: { project?: string; name?: string; from?: string; setup?: string | false } | undefined;
  }>('/api/tables', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    const { project = workspace.active.projectId, name, from, setup } = request.body ?? {};
    if (!name) return reply.code(400).send({ error: 'Give the new table a name.' });
    if ((await workspace.tables(project)).includes(name)) {
      return reply.code(400).send({ error: `There is already a table "${name}".` });
    }
    const session = from
      ? await workspace.duplicateTable(project, from, name)
      : await workspace.table(project, name, { setup });
    return { project: session.projectId, table: session.tableName };
  });
  app.delete<{ Querystring: { project?: string; name: string } }>(
    '/api/tables',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      await workspace.deleteTable(
        request.query.project ?? workspace.active.projectId,
        request.query.name,
      );
      return { ok: true };
    },
  );
}
