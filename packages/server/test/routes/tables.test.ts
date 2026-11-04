import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../server.js';

const example = fileURLToPath(new URL('../../../../examples/harvest-moon', import.meta.url));
const legacy = fileURLToPath(
  new URL('../../../formats/fixtures/legacy-harvest-moon', import.meta.url),
);

let server: RunningServer;

/** Serves a copy of a project folder. */
async function serve(source: string): Promise<RunningServer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-routes-'));
  await cp(source, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return startServer({ projectDir: dir, port: 0, appDir: path.join(dir, 'no-app') });
}

beforeEach(async () => {
  server = await serve(example);
});

afterEach(() => server.close());

const post = (route: string, body: unknown) =>
  fetch(`${server.url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('the table menu', () => {
  it('creates, duplicates and deletes tables for the host', async () => {
    expect(await (await post('/api/tables', { name: 'empty', setup: false })).json()).toMatchObject(
      { table: 'empty' },
    );
    expect((await post('/api/tables', { name: 'copy', from: 'empty' })).status).toBe(200);
    const taken = await post('/api/tables', { name: 'copy' });
    expect(taken.status).toBe(400);
    expect(await taken.json()).toEqual({ error: 'There is already a table "copy".' });
    expect((await post('/api/tables', {})).status).toBe(400);
    const deleted = await fetch(`${server.url}/api/tables?name=copy`, { method: 'DELETE' });
    expect(await deleted.json()).toEqual({ ok: true });
    expect(await server.workspace.tables(server.session.projectId)).toEqual(['empty', 'table-1']);
  });

  it('lists every component for print-and-play', async () => {
    const components = (await (await fetch(`${server.url}/api/components`)).json()) as unknown[];
    expect(components).toHaveLength(server.session.project.components.length);
  });
});

describe('invite links', () => {
  it('uses every address others can reach the server at', async () => {
    expect(await server.inviteLinks()).toEqual([]);
    server.addShareBase('https://tunnel.example//');
    const [link] = await server.inviteLinks({ table: 'table-1' });
    // Tokens are base64url, so they can hold - and _.
    expect(link).toMatch(/^https:\/\/tunnel\.example\/join\/[\w-]+$/);
  });
});

describe('designing types', () => {
  const put = (id: string, body: unknown) =>
    fetch(`${server.url}/api/types/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const coin = { id: 'coin', is: 'piece', size: 20, face: { shape: 'circle' } };

  it('saves a type, then refuses a save made against an older file', async () => {
    const library = (await (await fetch(`${server.url}/api/library`)).json()) as {
      files: Record<string, string>;
      types: Record<string, string>;
    };
    // A new piece goes next to the first piece, the action card.
    expect(library.types['action-card']).toBe('library/cards.yaml');
    const baseHash = library.files['library/cards.yaml'];

    const saved = await put('coin', { definition: coin, baseHash });
    expect(await saved.json()).toMatchObject({ file: 'library/cards.yaml', created: true });
    expect(server.workspace.project().types.coin).toBeDefined();

    const stale = await put('coin', { definition: { ...coin, size: 22 }, baseHash });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toMatch(/changed since/);
  });

  it('explains what is wrong with a type it cannot save or remove', async () => {
    expect((await put('coin', { definition: { ...coin, id: 'other' } })).status).toBe(400);
    const invalid = await put('coin', { definition: { ...coin, size: 'big' } });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: string }).error).toMatch(
      /Invalid component:\n {2}size:/,
    );
    const inUse = await fetch(`${server.url}/api/types/worker`, { method: 'DELETE' });
    expect(inUse.status).toBe(400);
    await put('coin', { definition: coin });
    const removed = await fetch(`${server.url}/api/types/coin`, { method: 'DELETE' });
    expect(((await removed.json()) as { types: object }).types).not.toHaveProperty('coin');
  });
});

describe('renaming and uploading in the designer', () => {
  interface Reply {
    id?: string;
    field?: string;
    file?: string;
    error?: string;
    types?: Record<string, string>;
  }
  const send = async (method: string, route: string, body: unknown, headers = {}) => {
    const response = await fetch(`${server.url}${route}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, reply: (await response.json()) as Reply };
  };

  it('renames a type and a field, and answers with the library', async () => {
    const type = await send('POST', '/api/types/worker/rename', { to: 'farmer' });
    expect(type.reply).toMatchObject({ id: 'farmer', types: { farmer: 'library/pieces.yaml' } });
    expect(type.reply.types).not.toHaveProperty('worker');

    const field = await send('POST', '/api/types/farmer/fields/color/rename', { to: 'colour' });
    expect(field.reply).toMatchObject({
      field: 'colour',
      types: { farmer: 'library/pieces.yaml' },
    });
    expect(server.workspace.project().types.farmer!.fields).toHaveProperty('colour');
  });

  it('explains a rename it cannot make', async () => {
    const missing = await send('POST', '/api/types/worker/rename', {});
    expect(missing).toEqual({ status: 400, reply: { error: 'Send the new name as "to".' } });
    const taken = await send('POST', '/api/types/worker/rename', { to: 'd6' });
    expect(taken.status).toBe(400);
    expect(taken.reply.error).toMatch(/already a component "d6"/);
    const field = await send('POST', '/api/types/worker/fields/size/rename', { to: 'height' });
    expect(field).toEqual({ status: 400, reply: { error: '"worker" has no field "size".' } });
  });

  it('saves and names images, cuts them into tiles, and keeps colours', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
    const images = '/api/assets/images';
    const saved = await send('POST', images, { file: 'assets/dropped.svg', base64: svg });
    expect(saved).toEqual({ status: 200, reply: { name: 'dropped', file: 'assets/dropped.svg' } });
    // The same name again is saved next to it, so artwork in use is never replaced.
    const again = await send('POST', images, { file: 'assets/dropped.svg', base64: svg });
    expect(again.reply).toEqual({ name: 'dropped-2', file: 'assets/dropped-2.svg' });
    // Larger than the 1 MB other requests are limited to.
    const photo = Buffer.alloc(2 * 1024 * 1024).toString('base64');
    expect((await send('POST', images, { file: 'photo.png', base64: photo })).status).toBe(200);
    expect((await send('POST', images, { file: 'notes.txt', base64: svg })).status).toBe(400);
    expect((await send('POST', images, { file: 'a.png' })).status).toBe(400);

    const sheet = { file: 'assets/dropped.svg', rows: 2, cols: 3 };
    expect((await send('PUT', `${images}/dropped`, sheet)).status).toBe(200);
    expect(server.workspace.project().assets.images.dropped).toEqual(sheet);
    expect((await send('PUT', `${images}/dropped`, { ...sheet, rows: 0 })).status).toBe(400);
    expect((await send('DELETE', `${images}/dropped-2`, {})).status).toBe(200);
    expect(server.workspace.project().assets.images['dropped-2']).toBeUndefined();
    const renamed = await send('POST', `${images}/dropped/rename`, { to: 'sheet' });
    expect(renamed.status).toBe(200);
    expect(renamed.reply).toMatchObject({
      name: 'sheet',
      types: { worker: 'library/pieces.yaml' },
    });
    expect((await send('POST', `${images}/sheet/rename`, {})).status).toBe(400);

    expect((await send('PUT', '/api/assets/colors/sea', { color: '#2266aa' })).status).toBe(200);
    expect(server.workspace.project().assets.colors.sea).toBe('#2266aa');
    expect((await send('DELETE', '/api/assets/colors/sea', {})).status).toBe(200);
    expect((await send('PUT', '/api/assets/colors/sea', {})).status).toBe(400);
  });

  it('lets only the host rename and upload', async () => {
    const remote = { 'x-forwarded-for': '203.0.113.9' };
    const rename = await send('POST', '/api/types/worker/rename', { to: 'farmer' }, remote);
    expect(rename.status).toBe(403);
    const field = await send('POST', '/api/types/worker/fields/color/rename', { to: 'c' }, remote);
    expect(field.status).toBe(403);
    const upload = await send('POST', '/api/assets/images', { file: 'a.svg', base64: '' }, remote);
    expect(upload.status).toBe(403);
    const image = await send('POST', '/api/assets/images/dice/rename', { to: 'd' }, remote);
    expect(image.status).toBe(403);
    const color = await send('PUT', '/api/assets/colors/sea', { color: '#fff' }, remote);
    expect(color.status).toBe(403);
    expect(server.workspace.project().types.worker).toBeDefined();
  });
});

describe('migrating a project', () => {
  beforeEach(async () => {
    await server.close();
    server = await serve(legacy);
  });

  it('moves a project in the first format to the current one, for the host only', async () => {
    const coin = { id: 'coin', is: 'piece', size: 20 };
    const refused = await fetch(`${server.url}/api/types/coin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ definition: coin }),
    });
    expect(((await refused.json()) as { error: string }).error).toMatch(/Migrate it first/);

    const remote = await fetch(`${server.url}/api/migrate`, {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(remote.status).toBe(403);
    expect(server.workspace.project().legacy).toBe(true);

    const migrated = await fetch(`${server.url}/api/migrate`, { method: 'POST' });
    const { files } = (await migrated.json()) as { files: string[] };
    expect(files).toContain('assets.yaml');
    expect(files).toContain('trayful.yaml');
    expect(server.workspace.project().legacy).toBe(false);

    const again = await fetch(`${server.url}/api/migrate`, { method: 'POST' });
    expect(again.status).toBe(400);
    expect(await again.json()).toEqual({ error: 'This project is already in trayful/2.' });
  });
});
