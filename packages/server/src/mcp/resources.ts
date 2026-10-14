import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { withoutOtherHands } from '@trayful/core';
import { toJsonSchemas } from '@trayful/formats';
import { docFiles, docsIndex, readDoc } from '../docs.js';
import { AGENT_PLAYER } from '../players.js';
import type { Workspace } from '../workspace.js';
import type { ToolContext } from './context.js';

const json = (uri: URL, value: unknown) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value) }],
});
const variable = (value: string | string[]) => String(Array.isArray(value) ? value[0] : value);

/** Lists one resource per saved table of every project, such as its state. */
const tableResources = (workspace: Workspace, suffix: string) => ({
  list: async () => ({
    resources: (
      await Promise.all(
        workspace
          .projects()
          .filter((e) => e.project)
          .map(async (e) =>
            (await workspace.tables(e.id)).map((t) => ({
              uri: `trayful://project/${e.id}/tables/${t}/${suffix}`,
              name: `${e.id}/${t} ${suffix}`,
            })),
          ),
      )
    ).flat(),
  }),
});

/** Resources: projects, tables, component types, schemas and documentation. */
export function registerResources(server: McpServer, ctx: ToolContext): void {
  registerProjectResources(server, ctx);
  registerTypeResources(server, ctx);
  registerTableResources(server, ctx);
  registerDocResources(server);
}

/** The projects and their manifests. */
function registerProjectResources(server: McpServer, ctx: ToolContext): void {
  const { workspace } = ctx;
  server.registerResource(
    'projects',
    'trayful://projects',
    {
      title: 'Projects',
      description: 'Every project in the workspace, with its tables.',
      mimeType: 'application/json',
    },
    async (uri) =>
      json(
        uri,
        await Promise.all(
          workspace.projects().map(async (e) => ({
            id: e.id,
            name: e.project?.manifest.name ?? e.id,
            tables: e.project ? await workspace.tables(e.id) : [],
            problems: e.problems,
          })),
        ),
      ),
  );

  server.registerResource(
    'project-manifest',
    new ResourceTemplate('trayful://project/{project}/manifest', {
      list: () => ({
        resources: workspace.projects().map((e) => ({
          uri: `trayful://project/${e.id}/manifest`,
          name: e.project?.manifest.name ?? e.id,
          mimeType: 'application/json',
        })),
      }),
    }),
    {
      title: 'Project',
      description: 'A project manifest, its component types, decks, setups and what is in the box.',
      mimeType: 'application/json',
    },
    (uri, vars) => {
      const project = workspace.project(variable(vars.project!));
      return json(uri, {
        manifest: project.manifest,
        types: Object.keys(project.types),
        decks: project.decks,
        setups: Object.keys(project.setups),
        components: project.components.map((c) => ({ id: c.id, type: c.type, deck: c.deck })),
      });
    },
  );
}

/** Each component type of each project, as its library defines it. */
function registerTypeResources(server: McpServer, { workspace }: ToolContext): void {
  server.registerResource(
    'component-type',
    new ResourceTemplate('trayful://project/{project}/types/{type}', {
      list: () => ({
        resources: workspace
          .projects()
          .filter((e) => e.project)
          .flatMap((e) =>
            Object.values(e.project!.types).map((t) => ({
              uri: `trayful://project/${e.id}/types/${t.id}`,
              name: t.name ?? t.id,
              mimeType: 'application/json',
            })),
          ),
      }),
    }),
    {
      title: 'Component type',
      description: 'One component type: fields, faces, size, and the library file it lives in.',
    },
    (uri, vars) => {
      const project = workspace.project(variable(vars.project!));
      const found = project.types[variable(vars.type!)];
      if (!found) throw new Error(`No component type "${variable(vars.type!)}".`);
      const definition: Record<string, unknown> = { ...found, file: found.source.file };
      delete definition.source;
      delete definition.normalizedFields;
      return json(uri, definition);
    },
  );
}

/** The state and a picture of each saved table. */
function registerTableResources(server: McpServer, ctx: ToolContext): void {
  const { workspace } = ctx;
  server.registerResource(
    'table-state',
    new ResourceTemplate(
      'trayful://project/{project}/tables/{table}/state',
      tableResources(workspace, 'state'),
    ),
    {
      title: 'Table state',
      description:
        "Everything on a table as JSON, including face-down cards and your own hand, but not other players' hands.",
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const s = await workspace.table(variable(vars.project!), variable(vars.table!), {
        create: false,
      });
      return json(uri, withoutOtherHands(s.engine.state, AGENT_PLAYER));
    },
  );

  server.registerResource(
    'table-snapshot',
    new ResourceTemplate(
      'trayful://project/{project}/tables/{table}/snapshot.png',
      tableResources(workspace, 'snapshot.png'),
    ),
    {
      title: 'Picture of a table',
      description: 'A PNG of a whole table. Needs that table open in a browser.',
      mimeType: 'image/png',
    },
    async (uri, vars) => {
      const s = await workspace.table(variable(vars.project!), variable(vars.table!), {
        create: false,
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'image/png',
            blob: (await s.requestSnapshot()).toString('base64'),
          },
        ],
      };
    },
  );
}

/** The file format schemas and the documentation. */
function registerDocResources(server: McpServer): void {
  server.registerResource(
    'schema',
    'trayful://schema',
    {
      title: 'File format schemas',
      description: 'JSON Schemas for every Trayful file kind.',
      mimeType: 'application/json',
    },
    (uri) => json(uri, toJsonSchemas()),
  );

  server.registerResource(
    'docs',
    'trayful://docs',
    {
      title: 'Documentation index',
      description:
        'HOWTO guides for designers and the full file format reference, as a list of documents to read.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: await docsIndex() }],
    }),
  );

  server.registerResource(
    'doc',
    new ResourceTemplate('trayful://docs/{+path}', {
      list: async () => ({
        resources: (await docFiles()).map((file) => ({
          uri: `trayful://docs/${file}`,
          name: file,
          mimeType: 'text/markdown',
        })),
      }),
    }),
    {
      title: 'Documentation page',
      description: 'One guide or reference page.',
      mimeType: 'text/markdown',
    },
    async (uri, vars) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: await readDoc(variable(vars.path!)) },
      ],
    }),
  );
}
