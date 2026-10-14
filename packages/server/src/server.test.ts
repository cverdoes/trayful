import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Piece, ServerMessage, Stack, TableView } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { isLocalOrigin, startServer, type RunningServer } from './server.js';
import { frameText } from './frames.js';

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

/**
 * Opens a socket and collects messages; `next()` waits for the next one. Player
 * lists are kept apart in `players`, since they arrive whenever someone comes or goes.
 */
async function connect(origin?: string, headers: Record<string, string> = {}) {
  const socket = new WebSocket(server.url.replace('http', 'ws') + '/ws', {
    headers,
    ...(origin ? { origin } : {}),
  });
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const players: ServerMessage[] = [];
  socket.on('message', (data) => {
    const message = JSON.parse(frameText(data)) as ServerMessage;
    if (message.type === 'players') {
      players.push(message);
      return;
    }
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
    players,
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
      root: dir,
      table: 'table-1',
    });
    const view = (await (await fetch(`${server.url}/api/project`)).json()) as {
      types: Record<string, { source?: unknown }>;
    };
    expect(Object.keys(view.types)).toContain('action-card');
    expect(view.types['action-card']!.source).toBeUndefined();
    const table = (await (await fetch(`${server.url}/api/table`)).json()) as TableView;
    expect(table.table).toBe('table-1');
    // The seed predicts shuffles, so no one is shown it.
    expect(table.seed).toBe(0);
    expect(server.session.engine.state.seed).toBe(7);
  });

  it('serves project images but nothing else from the project folder', async () => {
    const files = `${server.url}/project-files/${path.basename(dir)}`;
    expect((await fetch(`${files}/assets/card-back.svg`)).status).toBe(200);
    expect((await fetch(`${files}/inventory.yaml`)).status).toBe(404);
    expect((await fetch(`${files}/%2e%2e/package.json`)).status).toBe(404);
    expect((await fetch(`${server.url}/project-files/nope/assets/card-back.svg`)).status).toBe(400);
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
    ).toHaveLength(5);
    a.send({ type: 'undo' });
    const undone = await a.next();
    expect(
      undone.type === 'state' && (undone.state.objects[DECK] as { items: string[] }).items,
    ).toHaveLength(4);
    a.socket.close();
  });

  it('saves the table and reopens it', async () => {
    const a = await connect();
    await a.next();
    a.send({ type: 'command', command: { type: 'draw', from: DECK, count: 2, to: [300, 300] } });
    await a.next();
    const before = server.session.engine.state;
    a.socket.close();
    await server.close();
    const saved = JSON.parse(await readFile(path.join(dir, 'tables', 'table-1.json'), 'utf8'));
    expect(saved.objects.find((o: { id: string }) => o.id === DECK).items).toHaveLength(3);

    server = await startServer({ projectDir: dir, port: 0, appDir: path.join(dir, 'no-app') });
    expect(server.session.engine.state).toEqual(before);
  });

  it('rejects sockets from other websites', async () => {
    const a = await connect('https://evil.example');
    const code = await new Promise<number>((resolve) => a.socket.once('close', resolve));
    expect(code).toBe(1008);
  });
});

interface Me {
  player?: { id: string };
}

/** Requests that arrive through a tunnel, as a guest's do. */
const REMOTE = { 'x-forwarded-for': '203.0.113.9' };

/** The invite token to a table of the test project. */
async function inviteTo(table = 'table-1'): Promise<string> {
  return (await server.workspace.players.invite(server.session.projectId, table)).token;
}

/** Joins as a guest through the invite link and returns their cookie header. */
async function joinAsGuest(name: string): Promise<string> {
  const invite = await fetch(`${server.url}/join/${await inviteTo()}`, {
    headers: REMOTE,
    redirect: 'manual',
  });
  expect(invite.status).toBe(302);
  const inviteCookie = invite.headers.get('set-cookie')!.split(';')[0]!;
  const join = await fetch(`${server.url}/api/join`, {
    method: 'POST',
    headers: { ...REMOTE, cookie: inviteCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  expect(join.status).toBe(200);
  return `${inviteCookie}; ${join.headers.get('set-cookie')!.split(';')[0]}`;
}

describe('players and hands', () => {
  it('keeps tables closed to people without an invite', async () => {
    expect((await fetch(`${server.url}/api/table`, { headers: REMOTE })).status).toBe(403);
    expect((await fetch(`${server.url}/join/wrong`, { headers: REMOTE })).status).toBe(403);
    const me = (await (await fetch(`${server.url}/api/me`, { headers: REMOTE })).json()) as Me;
    expect(me).toMatchObject({ host: false, invited: false, joined: false });
    expect(me.player).toBeUndefined();
    const join = await fetch(`${server.url}/api/join`, {
      method: 'POST',
      headers: { ...REMOTE, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mallory' }),
    });
    expect(join.status).toBe(403);
    const mcp = await fetch(`${server.url}/mcp`, { method: 'POST', headers: REMOTE });
    expect(mcp.status).toBe(403);
  });

  it('lets an invited guest join, and keeps host-only actions for the host', async () => {
    const cookie = await joinAsGuest('Bob Builder');
    const me = (await (
      await fetch(`${server.url}/api/me`, { headers: { ...REMOTE, cookie } })
    ).json()) as Me;
    expect(me.player).toMatchObject({ id: 'bob-builder', name: 'Bob Builder', role: 'guest' });
    const host = await (await fetch(`${server.url}/api/me`)).json();
    expect(host).toMatchObject({ host: true, player: { role: 'host' } });

    const headers = { ...REMOTE, cookie, 'content-type': 'application/json' };
    const create = await fetch(`${server.url}/api/tables`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'mine' }),
    });
    expect(create.status).toBe(403);
    expect((await fetch(`${server.url}/api/components`, { headers })).status).toBe(403);
    const invite = await fetch(`${server.url}/api/invites`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    expect(invite.status).toBe(403);
    const forged = await fetch(`${server.url}/api/me`, {
      method: 'POST',
      headers: { ...headers, origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'Hacked' }),
    });
    expect(forged.status).toBe(403);
    // A website pointing its own name at this computer is not the host.
    const rebound = await server.app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { host: 'evil.example:4317' },
      payload: {},
    });
    expect(rebound.statusCode).toBe(403);
    const own = await server.app.inject({ method: 'POST', url: '/api/invites', payload: {} });
    expect(own.statusCode).toBe(200);
  });

  it('shows each player their own hand and only counts of the others', async () => {
    const cookie = await joinAsGuest('Bob');
    const host = (await server.workspace.players.host()).id;
    const alice = await connect();
    const bob = await connect(undefined, { ...REMOTE, cookie });
    await Promise.all([alice.next(), bob.next()]);

    alice.send({
      type: 'command',
      command: { type: 'deal', from: DECK, to: [`hand:${host}`, 'hand:bob'], count: 1 },
    });
    const [forAlice, forBob] = (await Promise.all([alice.next(), bob.next()])) as Extract<
      ServerMessage,
      { type: 'state' }
    >[];
    const real = server.session.engine.state.objects;
    const handOf = (view: TableView, id: string) =>
      Object.values(view.objects).filter((o) => o.kind === 'piece' && o.hand === id);
    expect(handOf(forAlice!.state, host)).toHaveLength(1);
    expect(handOf(forAlice!.state, 'bob')).toHaveLength(0);
    expect(handOf(forBob!.state, 'bob')).toHaveLength(1);
    expect(handOf(forBob!.state, host)).toHaveLength(0);
    expect(forBob!.state.hands).toEqual({ [host]: 1, bob: 1 });
    expect(forBob!.activity).toMatchObject({
      by: 'person',
      player: host,
      text: 'dealt 1 piece each',
    });

    // Bob cannot reach Alice's cards, even knowing their ids.
    const aliceCard = handOf(forAlice!.state, host)[0]!.id;
    expect(JSON.stringify(forBob!.state)).not.toContain(aliceCard);
    bob.send({ type: 'command', command: { type: 'move', ids: [aliceCard], to: [0, 0] } });
    expect(await bob.next()).toMatchObject({ message: "That piece is in another player's hand." });

    // He plays a face-down card from the deck by the stand-in id he was shown.
    const deck = forBob!.state.objects[DECK] as Stack;
    expect(deck.items[0]).toMatch(/^hidden-/);
    bob.send({ type: 'command', command: { type: 'take', id: deck.items[0], to: 'hand:bob' } });
    const after = (await bob.next()) as Extract<ServerMessage, { type: 'state' }>;
    expect(handOf(after.state, 'bob')).toHaveLength(2);
    expect((real[DECK] as Stack).items).toHaveLength(3);
    expect((server.session.engine.state.objects[DECK] as Stack).items).toHaveLength(2);
    const bobCards = handOf(after.state, 'bob') as Piece[];
    expect(bobCards.every((p) => p.data && !p.id.startsWith('hidden-'))).toBe(true);
    await alice.next();

    expect(bob.players.at(-1)).toMatchObject({
      type: 'players',
      you: 'bob',
      players: [
        { id: host, role: 'host', online: true },
        { id: 'bob', role: 'guest', online: true },
      ],
    });
    alice.socket.close();
    bob.socket.close();
  });

  it('lets guests watch but not play until they join', async () => {
    const invite = await fetch(`${server.url}/join/${await inviteTo()}`, {
      headers: REMOTE,
      redirect: 'manual',
    });
    const cookie = invite.headers.get('set-cookie')!.split(';')[0]!;
    expect(invite.headers.get('location')).toBe(
      `/?project=${server.session.projectId}&table=table-1&join`,
    );
    const watcher = await connect(undefined, { ...REMOTE, cookie });
    expect((await watcher.next()).type).toBe('state');
    watcher.send({ type: 'command', command: { type: 'shuffle', id: DECK } });
    expect(await watcher.next()).toMatchObject({ message: 'Join the table to play.' });
    watcher.socket.close();
  });
});

describe('invites and undo', () => {
  it('lets a guest into the invited table only, for good once joined', async () => {
    const project = server.session.projectId;
    await server.workspace.duplicateTable(project, 'table-1', 'other');
    const cookie = await joinAsGuest('Bob');
    const get = (url: string) => fetch(`${server.url}${url}`, { headers: { ...REMOTE, cookie } });
    expect((await get(`/api/table?project=${project}&table=table-1`)).status).toBe(200);
    expect((await get(`/api/table?project=${project}&table=other`)).status).toBe(403);
    const projects = (await (await get('/api/projects')).json()) as { tables: string[] }[];
    expect(projects.map((p) => p.tables)).toEqual([['table-1']]);

    // A new link to the table stops the old one working, but Bob, who joined, stays in.
    const renewed = await server.app.inject({
      method: 'POST',
      url: '/api/invites',
      payload: { project, table: 'table-1', renew: true },
    });
    expect(renewed.statusCode).toBe(200);
    expect(renewed.json().links).toEqual([]);
    const playerOnly = cookie.split('; ').find((c) => c.startsWith('trayful_player'))!;
    const again = await fetch(`${server.url}/api/table?project=${project}&table=table-1`, {
      headers: { ...REMOTE, cookie: playerOnly },
    });
    expect(again.status).toBe(200);
    expect(
      (
        await fetch(
          `${server.url}/join/${(await server.workspace.players.invite(project, 'other')).token.slice(1)}`,
          { headers: REMOTE },
        )
      ).status,
    ).toBe(403);
  });

  it('lets each player undo only their own moves', async () => {
    const cookie = await joinAsGuest('Bob');
    const alice = await connect();
    const bob = await connect(undefined, { ...REMOTE, cookie });
    await Promise.all([alice.next(), bob.next()]);
    bob.send({ type: 'command', command: { type: 'shuffle', id: DECK } });
    const [forAlice, forBob] = await Promise.all([alice.next(), bob.next()]);
    expect(forAlice).toMatchObject({ canUndo: false });
    expect(forBob).toMatchObject({ canUndo: true });
    const revision = forBob.type === 'state' ? forBob.revision : 0;
    alice.send({ type: 'undo' });
    bob.send({ type: 'undo' });
    expect(await bob.next()).toMatchObject({
      revision: revision + 1,
      canUndo: false,
      canRedo: true,
      activity: { name: 'Bob', text: 'undid their last change' },
    });
    alice.socket.close();
    bob.socket.close();
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
