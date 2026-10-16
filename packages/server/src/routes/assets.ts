import type { FastifyReply } from 'fastify';
import { addImage, removeImage, setColor, setImage } from '../assets.js';
import { libraryFiles } from '../authoring.js';
import { renameImage } from '../renaming.js';
import type { RouteContext } from './context.js';
import { newName, projectOf, type ProjectQuery, type RenameBody } from './authoring.js';

/** Images arrive as base64, a third larger than the file. */
const IMAGE_BODY_LIMIT = 20 * 1024 * 1024;

interface ImageBody {
  file?: unknown;
  base64?: unknown;
  rows?: unknown;
  cols?: unknown;
}

interface NameParams {
  Params: { name: string };
  Querystring: ProjectQuery;
}

/** The assets page of the designer: naming images, cutting them into tiles, and colours. */
export function registerAssetRoutes(ctx: RouteContext): void {
  const { app, workspace, hostOnly } = ctx;
  // A new image, saved under an unused path and named after its file.
  app.post<{ Querystring: ProjectQuery; Body: ImageBody | undefined }>(
    '/api/assets/images',
    { bodyLimit: IMAGE_BODY_LIMIT },
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { file, base64 } = request.body ?? {};
      if (typeof file !== 'string' || typeof base64 !== 'string') {
        return badRequest(reply, 'Send the file name as "file" and its contents as "base64".');
      }
      const tiles = tilesOf(request.body, reply);
      if (!tiles) return;
      return addImage(workspace, projectOf(ctx, request.query), { file, base64, ...tiles });
    },
  );

  app.put<NameParams & { Body: ImageBody | undefined }>(
    '/api/assets/images/:name',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const { file } = request.body ?? {};
      if (typeof file !== 'string') return badRequest(reply, 'Send the image\'s path as "file".');
      const tiles = tilesOf(request.body, reply);
      if (!tiles) return;
      await setImage(workspace, projectOf(ctx, request.query), request.params.name, {
        file,
        ...tiles,
      });
      return { name: request.params.name };
    },
  );

  app.delete<NameParams>('/api/assets/images/:name', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    await removeImage(workspace, projectOf(ctx, request.query), request.params.name);
    return { name: request.params.name };
  });

  // A new name for an image, changed on every component that shows it; answers the new library.
  app.post<NameParams & { Body: RenameBody | undefined }>(
    '/api/assets/images/:name/rename',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const to = newName(request.body, reply);
      if (to === undefined) return;
      const projectId = projectOf(ctx, request.query);
      const { name } = await renameImage(workspace, projectId, request.params.name, to);
      return { name, ...(await libraryFiles(workspace, projectId)) };
    },
  );

  app.put<NameParams & { Body: { color?: unknown } | undefined }>(
    '/api/assets/colors/:name',
    async (request, reply) => {
      if (hostOnly(request, reply)) return;
      const color = request.body?.color;
      if (typeof color !== 'string' || !color) {
        return badRequest(reply, 'Send the colour as "color", such as "#d94b3d".');
      }
      await setColor(workspace, projectOf(ctx, request.query), request.params.name, color);
      return { name: request.params.name };
    },
  );

  app.delete<NameParams>('/api/assets/colors/:name', async (request, reply) => {
    if (hostOnly(request, reply)) return;
    await setColor(workspace, projectOf(ctx, request.query), request.params.name, undefined);
    return { name: request.params.name };
  });
}

/** Rows and columns of tiles from a request, each a whole number from 1, or left out. */
function tilesOf(
  body: ImageBody | undefined,
  reply: FastifyReply,
): { rows?: number; cols?: number } | undefined {
  const { rows, cols } = body ?? {};
  const valid = (n: unknown) => n === undefined || (Number.isInteger(n) && (n as number) >= 1);
  if (valid(rows) && valid(cols)) return { rows: rows as number, cols: cols as number };
  void badRequest(reply, 'Rows and columns are whole numbers from 1.');
  return undefined;
}

function badRequest(reply: FastifyReply, error: string) {
  return reply.code(400).send({ error });
}
