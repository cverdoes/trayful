import { createHmac } from 'node:crypto';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Repository } from '../../src/git/repository.js';
import { EDITING_TOOLS } from '../../src/mcp/authoring.js';
import { startServer, type RunningServer, type ServerOptions } from '../../src/server.js';
import { makeRemote, pushFromLaptop, sh, type Remote } from '../git/remote.js';

let server: RunningServer;
let remote: Remote;
let client: Client;

interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { isError: result.isError ?? false, text: result.content[0]?.text ?? '' };
}

const WEBHOOK_SECRET = 'hook-secret';

async function start(options: Partial<ServerOptions> = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
  const repository = await Repository.open({
    dataDir,
    allowLocalUrls: true,
    webhookSecret: WEBHOOK_SECRET,
  });
  server = await startServer({
    repository,
    port: 0,
    appDir: path.join(dataDir, 'no-app'),
    watch: false,
    syncTimes: false,
    ...options,
  });
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
}

beforeEach(async () => {
  remote = await makeRemote();
});

/** Waits for `check` to hold, trying every 50 ms for up to five seconds. */
async function eventually(check: () => boolean | Promise<boolean>) {
  for (let i = 0; i < 100 && !(await check()); i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  expect(await check()).toBe(true);
}

const lastCommit = () => {
  sh(remote.laptop, 'fetch', '--quiet', 'origin');
  return sh(remote.laptop, 'log', '-1', '--format=%s', 'origin/main').trim();
};

afterEach(async () => {
  await client.close();
  await server.close();
});

describe('a git-backed Trayful', () => {
  beforeEach(() => start());

  it('waits with no project, and says so to agents and pages', async () => {
    expect(await (await fetch(`${server.url}/api/health`)).json()).toEqual({
      ok: true,
      waiting: true,
    });
    const table = await fetch(`${server.url}/api/table`);
    expect(table.status).toBe(400);
    expect(((await table.json()) as { error: string }).error).toMatch(/no project yet/);
    expect(client.getInstructions()).toContain('connect_repository');
    expect(await call('describe_table')).toMatchObject({ isError: true });
    expect(JSON.parse((await call('repository_status')).text)).toMatchObject({ connected: false });
  });

  it('connects over MCP, then plays and syncs', async () => {
    const connected = await call('connect_repository', { url: remote.url, path: 'prototype' });
    expect(connected.isError).toBe(false);
    expect(JSON.parse(connected.text)).toMatchObject({ connected: true, branch: 'main' });
    expect((await call('list_projects')).text).toContain('"name":"My Game"');
    expect((await call('describe_table')).isError).toBe(false);

    const root = server.git!.repository.projectRoot;
    const manifest = path.join(root, 'trayful.yaml');
    await writeFile(manifest, (await readFile(manifest, 'utf8')) + '# from trayful\n');
    expect((await call('sync_repository', { message: 'Edit the manifest' })).text).toBe(
      'Synced: committed the changes made here, pushed.',
    );
    sh(remote.laptop, 'pull', '--quiet', 'origin', 'main');
    expect(sh(remote.laptop, 'log', '-1', '--format=%s')).toContain('Edit the manifest');

    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) =>
      t.replace(/^name: .*$/m, 'name: "Renamed Game"'),
    );
    expect((await call('sync_repository')).text).toContain('took in new commits');
    expect((await call('list_projects')).text).toContain('Renamed Game');
    expect((await call('sync_repository')).text).toBe('Already in sync.');
  });

  it('reports a conflict, and resolves it by taking the repository', async () => {
    await call('connect_repository', { url: remote.url, path: 'prototype' });
    const manifest = path.join(server.git!.repository.projectRoot, 'trayful.yaml');
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t + '# laptop\n');
    await writeFile(manifest, (await readFile(manifest, 'utf8')) + '# trayful\n');
    const synced = await call('sync_repository');
    expect(synced.text).toMatch(/^Conflict: .*prototype\/trayful\.yaml.*trayful\/conflict-/);
    expect((await call('resolve_conflict')).text).toContain('took in new commits');
    expect(await readFile(manifest, 'utf8')).toContain('# laptop');
    expect(await call('resolve_conflict')).toMatchObject({ isError: true });
  });

  it('lets the host connect, sync and see the status over HTTP', async () => {
    const post = (route: string, body: unknown) =>
      fetch(`${server.url}${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: server.url },
        body: JSON.stringify(body),
      });
    expect((await post('/api/repository/connect', {})).status).toBe(400);
    const typo = await post('/api/repository/connect', {
      url: remote.url,
      branch: 'mian',
      path: 'prototype',
    });
    expect(typo.status).toBe(400);
    expect(await typo.json()).toMatchObject({ fresh: { branch: 'mian' } });
    const connected = await post('/api/repository/connect', { url: remote.url, path: 'prototype' });
    expect(await connected.json()).toMatchObject({ connected: true, path: 'prototype' });
    expect((await fetch(`${server.url}/api/table`)).status).toBe(200);
    expect(await (await post('/api/repository/sync', {})).json()).toMatchObject({
      unpushed: 0,
      behind: 0,
    });
    expect(await (await fetch(`${server.url}/api/repository`)).json()).toMatchObject({
      connected: true,
    });
    expect((await post('/api/repository/resolve', {})).status).toBe(400);
  });

  it('names only real tools as the ones that edit files', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect([...EDITING_TOOLS].filter((t) => !names.includes(t))).toEqual([]);
  });

  it('keeps the repository from guests', async () => {
    const response = await fetch(`${server.url}/api/repository`, {
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    expect(response.status).toBe(403);
  });

  it('opens the project once a sync brings a fix for its errors', async () => {
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t.replace('name:', 'name: ['));
    expect(await call('connect_repository', { url: remote.url, path: 'prototype' })).toMatchObject({
      isError: true,
    });
    expect(await call('sync_repository')).toMatchObject({ isError: true });
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t.replace('name: [', 'name:'));
    expect((await call('sync_repository')).text).toContain('took in new commits');
    expect((await call('list_projects')).text).toContain('My Game');
  });
});

describe('commit messages', () => {
  beforeEach(() => start());

  it('say which tools an agent used, and who changed what in the browser', async () => {
    await call('connect_repository', { url: remote.url, path: 'prototype' });
    expect(await call('set_color', { name: 'sea', color: '#2266aa' })).toMatchObject({
      isError: false,
    });
    const put = await fetch(`${server.url}/api/assets/colors/sand`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', origin: server.url },
      body: JSON.stringify({ color: '#ddcc99' }),
    });
    expect(put.status).toBe(200);
    await call('sync_repository');
    expect(lastCommit()).toMatch(/^Trayful: set_color \(agent\); assets \(.+\)$/);
    // The next commit starts a fresh list.
    await writeFile(path.join(server.git!.repository.projectRoot, 'notes.md'), 'Playtest notes\n');
    await call('sync_repository');
    expect(lastCommit()).toBe('Trayful: save changes');
  });
});

describe('the push webhook', () => {
  beforeEach(() => start());

  const hook = (body: string, signature?: string) =>
    fetch(`${server.url}/api/repository/hook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '140.82.112.1',
        ...(signature ? { 'x-hub-signature-256': signature } : {}),
      },
      body,
    });
  const sign = (body: string) =>
    `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')}`;

  it('syncs at once when the branch is pushed to', async () => {
    await call('connect_repository', { url: remote.url, path: 'prototype' });
    await pushFromLaptop(remote, 'prototype/trayful.yaml', (t) => t + '# pushed\n');
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    expect((await hook(body, sign(body))).status).toBe(202);
    const manifest = path.join(server.git!.repository.projectRoot, 'trayful.yaml');
    await eventually(async () => (await readFile(manifest, 'utf8')).includes('# pushed'));
  });

  it('turns away events without the right signature, and ignores other branches', async () => {
    await call('connect_repository', { url: remote.url, path: 'prototype' });
    const body = JSON.stringify({ ref: 'refs/heads/main' });
    expect((await hook(body)).status).toBe(401);
    expect((await hook(body, sign('something else'))).status).toBe(401);
    const other = JSON.stringify({ ref: 'refs/heads/other' });
    expect((await hook(other, sign(other))).status).toBe(202);
    expect((await hook('not json', sign('not json'))).status).toBe(202);
  });
});

describe('syncing by itself', () => {
  it('commits after changes settle, and pushes on its own beat', async () => {
    await start({ watch: true, syncTimes: { saveAfterMs: 50, fetchEveryMs: 100, pushEveryMs: 0 } });
    await call('connect_repository', { url: remote.url, path: 'prototype' });
    await call('set_color', { name: 'sea', color: '#2266aa' });
    await eventually(() => lastCommit() === 'Trayful: set_color (agent)');
    await pushFromLaptop(remote, 'README.md', (t) => t + 'More rules.\n');
    const readme = path.join(server.git!.repository.cloneDir, 'README.md');
    await eventually(async () => (await readFile(readme, 'utf8')).includes('More rules.'));
  });
});

describe('without a webhook secret', () => {
  it('has no webhook', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-data-'));
    const repository = await Repository.open({ dataDir, allowLocalUrls: true });
    server = await startServer({ repository, port: 0, appDir: dataDir, syncTimes: false });
    client = new Client({ name: 'test', version: '0' });
    const response = await fetch(`${server.url}/api/repository/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(404);
  });
});
