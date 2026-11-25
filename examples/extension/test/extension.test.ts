import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from 'trayful/server';
import { projectCap } from '../extension.ts';

const example = fileURLToPath(new URL('../../starter', import.meta.url));

let server: RunningServer;

beforeEach(async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'trayful-cap-'));
  await cp(example, path.join(base, 'first'), { recursive: true });
  server = await startServer({
    projectDir: base,
    port: 0,
    watch: false,
    appDir: path.join(base, 'no-app'),
    extensions: [projectCap(2)],
  });
});

afterEach(() => server.close());

function newProject(name: string) {
  return server.app.inject({ method: 'POST', url: '/api/projects', payload: { name } });
}

describe('projectCap', () => {
  it('lets the folder grow to its cap, then refuses with its message', async () => {
    expect((await newProject('Second')).statusCode).toBe(200);
    const refused = await newProject('Third');
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ error: 'This Trayful holds at most 2 projects.' });
    expect(server.workspace.projects()).toHaveLength(2);
  });

  it('leaves tables to grow', async () => {
    const table = await server.app.inject({
      method: 'POST',
      url: '/api/tables',
      payload: { name: 'table-2' },
    });
    expect(table.json()).toEqual({ project: 'first', table: 'table-2' });
  });
});
