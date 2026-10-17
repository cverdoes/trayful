import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { RouteContext } from './context.js';

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Project images can come from someone else's game kit. An SVG opened on its own runs
 * its scripts with this server's rights, so the browser is told to run none of them.
 */
const IMAGE_POLICY =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; sandbox";

/** Images from project folders, and the browser app itself. */
export async function registerFileRoutes(
  { app, workspace }: RouteContext,
  appDir: string,
): Promise<void> {
  // Images referenced by a project's libraries, served from its folder.
  app.get<{ Params: { project: string; '*': string } }>(
    '/project-files/:project/*',
    async (request, reply) => {
      const entry = workspace.entry(request.params.project);
      const file = path.resolve(entry.dir, request.params['*']);
      const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
      if (
        !type ||
        !file.startsWith(entry.dir + path.sep) ||
        file.includes(`${path.sep}tables${path.sep}`)
      ) {
        return reply.code(404).send({ error: 'Not found' });
      }
      try {
        return await reply
          .type(type)
          .header('cache-control', 'no-cache')
          .header('content-security-policy', IMAGE_POLICY)
          .header('x-content-type-options', 'nosniff')
          .send(await readFile(file));
      } catch {
        return reply.code(404).send({ error: 'Not found' });
      }
    },
  );

  if (existsSync(path.join(appDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: appDir, prefix: '/', decorateReply: false });
  } else {
    app.get('/', async (_req, reply) =>
      reply
        .code(503)
        .type('text/plain')
        .send(
          'The Trayful browser app has not been built yet. Run `pnpm build` in the repository, then restart.',
        ),
    );
  }
}
