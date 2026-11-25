import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Growth } from '../src/play/limits.js';
import { startServer, type RunningServer } from '../src/server.js';
import { examplePath } from './paths.js';

let server: RunningServer;
/** Every growth the server asked about, and the kinds the test refuses. */
let asked: Growth[];
let refused: Set<Growth['kind']>;

beforeEach(async () => {
  asked = [];
  refused = new Set();
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-limits-')), 'game');
  await cp(examplePath('harvest-moon'), dir, {
    recursive: true,
    filter: (src) => path.basename(src) !== 'tables',
  });
  server = await startServer({
    projectDir: dir,
    port: 0,
    appDir: path.join(dir, 'no-app'),
    extensions: [
      {
        limits: () => (growth) => {
          asked.push(growth);
          return refused.has(growth.kind)
            ? `Your plan does not allow a new ${growth.kind}.`
            : undefined;
        },
      },
    ],
  });
});

afterEach(() => server.close());

const post = (route: string, body: unknown) =>
  fetch(`${server.url}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });

/** A refused request's status and reason. */
async function refusal(reply: Response): Promise<[number, string]> {
  return [reply.status, ((await reply.json()) as { error: string }).error];
}

describe('limits', () => {
  it('asks before anything grows, and lets it when they allow', async () => {
    expect((await post('/api/tables', { name: 'second', setup: false })).status).toBe(200);
    expect((await post('/api/invites', {})).status).toBe(200);
    expect(asked.map((g) => g.kind)).toEqual(['table', 'invite']);
  });

  it('refuses a new project, table or invite with the reason', async () => {
    refused = new Set(['project', 'table', 'invite']);
    expect(await refusal(await post('/api/projects', { name: 'Another' }))).toEqual([
      403,
      'Your plan does not allow a new project.',
    ]);
    expect((await post('/api/tables', { name: 'second', setup: false })).status).toBe(403);
    expect((await post('/api/tables', { name: 'copy', from: 'table-1' })).status).toBe(403);
    expect((await post('/api/invites', {})).status).toBe(403);
    // Tables that exist still open.
    expect((await fetch(`${server.url}/api/table`)).status).toBe(200);
  });

  it('refuses a file by its size', async () => {
    refused = new Set(['file']);
    const image = { file: 'images/dot.png', base64: Buffer.from('png').toString('base64') };
    expect((await post('/api/assets/images', image)).status).toBe(403);
    expect(asked.at(-1)).toEqual({ kind: 'file', project: 'game', bytes: 3 });
  });

  it("refuses an agent's request", async () => {
    refused = new Set(['agent']);
    const call = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
    expect(await refusal(await post('/mcp', call))).toEqual([
      403,
      'Your plan does not allow a new agent.',
    ]);
  });
});
