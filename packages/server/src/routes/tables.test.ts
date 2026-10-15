import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../server.js';

const example = fileURLToPath(new URL('../../../../examples/harvest-moon', import.meta.url));

let server: RunningServer;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-routes-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  server = await startServer({ projectDir: dir, port: 0, appDir: path.join(dir, 'no-app') });
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
    expect(link).toMatch(/^https:\/\/tunnel\.example\/join\/\w+/);
  });
});

describe('designing types', () => {
  const put = (id: string, body: unknown) =>
    fetch(`${server.url}/api/types/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const coin = { id: 'coin', base: 'token', size: 20, shape: 'circle' };

  it('saves a type, then refuses a save made against an older file', async () => {
    const library = (await (await fetch(`${server.url}/api/library`)).json()) as {
      files: Record<string, string>;
      types: Record<string, string>;
    };
    expect(library.types.worker).toBe('library/pieces.yaml');
    const baseHash = library.files['library/pieces.yaml'];

    const saved = await put('coin', { definition: coin, baseHash });
    expect(await saved.json()).toMatchObject({ file: 'library/pieces.yaml', created: true });
    expect(server.workspace.project().types.coin).toBeDefined();

    const stale = await put('coin', { definition: { ...coin, size: 22 }, baseHash });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: string }).error).toMatch(/changed since/);
  });

  it('explains what is wrong with a type it cannot save or remove', async () => {
    expect((await put('coin', { definition: { ...coin, id: 'other' } })).status).toBe(400);
    const invalid = await put('coin', { definition: { ...coin, size: 'big' } });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: string }).error).toMatch(/Invalid component type/);
    const inUse = await fetch(`${server.url}/api/types/worker`, { method: 'DELETE' });
    expect(inUse.status).toBe(400);
    await put('coin', { definition: coin });
    const removed = await fetch(`${server.url}/api/types/coin`, { method: 'DELETE' });
    expect(((await removed.json()) as { types: object }).types).not.toHaveProperty('coin');
  });
});
