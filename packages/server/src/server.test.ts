import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerMessage, TableState } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { isLocalOrigin, startServer, type RunningServer } from './server.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let dir: string;
let server: RunningServer;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-server-'));
  // Leave out tables saved by local play sessions so every test starts fresh.
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  server = await startServer({
    projectDir: dir,
    port: 0,
    seed: 7,
    appDir: path.join(dir, 'no-app'),
  });
});

afterEach(async () => {
  await server.close();
});

/** Opens a socket and collects messages; `next()` waits for the next one. */
async function connect(origin?: string) {
  const socket = new WebSocket(server.url.replace('http', 'ws') + '/ws', origin ? { origin } : {});
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  socket.on('message', (data) => {
    const message = JSON.parse(String(data)) as ServerMessage;
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else queue.push(message);
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return {
    socket,
    send: (message: unknown) => socket.send(JSON.stringify(message)),
    next: () =>
      new Promise<ServerMessage>((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiting.push(resolve);
      }),
  };
}

const DECK = 'deck:actions';

describe('server', () => {
  it('serves health, project view and table state', async () => {
    const health = await (await fetch(`${server.url}/api/health`)).json();
    expect(health).toEqual({
      ok: true,
      project: 'Harvest Moon',
      projectDir: dir,
      table: 'table-1',
    });
    const view = (await (await fetch(`${server.url}/api/project`)).json()) as {
      types: Record<string, { source?: unknown }>;
    };
    expect(Object.keys(view.types)).toContain('action-card');
    expect(view.types['action-card']!.source).toBeUndefined();
    const table = (await (await fetch(`${server.url}/api/table`)).json()) as TableState;
    expect(table.seed).toBe(7);
  });

  it('serves project images but nothing else from the project folder', async () => {
    expect((await fetch(`${server.url}/project-files/assets/card-back.svg`)).status).toBe(200);
    expect((await fetch(`${server.url}/project-files/inventory.yaml`)).status).toBe(404);
    expect((await fetch(`${server.url}/project-files/../package.json`)).status).toBe(404);
  });

  it('explains when the browser app is not built', async () => {
    const response = await fetch(`${server.url}/`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('pnpm build');
  });

  it('applies commands from one client and broadcasts state to all', async () => {
    const a = await connect();
    const b = await connect();
    const first = await a.next();
    await b.next();
    expect(first.type).toBe('state');

    a.send({ type: 'command', command: { type: 'shuffle', id: DECK } });
    const [ma, mb] = await Promise.all([a.next(), b.next()]);
    expect(ma).toEqual(mb);
    expect(ma).toMatchObject({ type: 'state', revision: 1, canUndo: true, canRedo: false });

    a.send({ type: 'undo' });
    expect(await b.next()).toMatchObject({ revision: 2, canUndo: false, canRedo: true });
    a.socket.close();
    b.socket.close();
  });

  it('reports invalid commands only to the sender', async () => {
    const a = await connect();
    await a.next();
    a.send({ type: 'command', command: { type: 'roll', id: 'coins' }, requestId: 'r1' });
    expect(await a.next()).toEqual({
      type: 'error',
      message: '"coins" is a counter, not a die.',
      requestId: 'r1',
    });
    a.socket.send('not json');
    expect(await a.next()).toMatchObject({ type: 'error', message: 'Messages must be JSON.' });
    a.send('just a string');
    expect(await a.next()).toMatchObject({
      type: 'error',
      message: expect.stringContaining('JSON objects'),
    });
    a.send({ type: 'command', command: { type: 'flip', ids: null } });
    expect(await a.next()).toMatchObject({
      type: 'error',
      message: expect.stringContaining('Invalid message'),
    });
    a.socket.close();
  });

  it('resets to a fresh table as one undoable step', async () => {
    const a = await connect();
    await a.next();
    a.send({ type: 'command', command: { type: 'draw', from: DECK, to: [0, 0] } });
    await a.next();
    a.send({ type: 'reset', seed: 3 });
    const reset = await a.next();
    expect(
      reset.type === 'state' && (reset.state.objects[DECK] as { items: string[] }).items,
    ).toHaveLength(10);
    a.send({ type: 'undo' });
    const undone = await a.next();
    expect(
      undone.type === 'state' && (undone.state.objects[DECK] as { items: string[] }).items,
    ).toHaveLength(9);
    a.socket.close();
  });

  it('saves the table and reopens it', async () => {
    const a = await connect();
    await a.next();
    a.send({ type: 'command', command: { type: 'draw', from: DECK, count: 2, to: [300, 300] } });
    const after = await a.next();
    a.socket.close();
    await server.close();
    const saved = JSON.parse(await readFile(path.join(dir, 'tables', 'table-1.json'), 'utf8'));
    expect(saved.objects.find((o: { id: string }) => o.id === DECK).items).toHaveLength(8);

    server = await startServer({ projectDir: dir, port: 0, appDir: path.join(dir, 'no-app') });
    expect(after.type === 'state' && server.session.engine.state).toEqual(
      after.type === 'state' && after.state,
    );
  });

  it('rejects sockets from other websites', async () => {
    const a = await connect('https://evil.example');
    const code = await new Promise<number>((resolve) => a.socket.once('close', resolve));
    expect(code).toBe(1008);
  });
});

describe('isLocalOrigin', () => {
  it('accepts local pages and non-browser clients only', () => {
    expect(isLocalOrigin(undefined)).toBe(true);
    expect(isLocalOrigin('http://localhost:5173')).toBe(true);
    expect(isLocalOrigin('http://127.0.0.1:4317')).toBe(true);
    expect(isLocalOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLocalOrigin('null')).toBe(false);
  });
});
