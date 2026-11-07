import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ServerMessage } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../../src/server.js';
import { examplePath } from '../paths.js';
import { openSocket } from '../sockets.js';

/** Requests through a tunnel: from elsewhere, so not the host. */
const REMOTE = { 'x-forwarded-for': '203.0.113.9' };
const DECK = 'deck:actions';

let server: RunningServer;
let host: string;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-engines-'));
  await cp(examplePath('harvest-moon'), dir, {
    recursive: true,
    filter: (src) => path.basename(src) !== 'tables',
  });
  server = await startServer({ projectDir: dir, port: 0, seed: 7, appDir: path.join(dir, 'x') });
  host = (await server.workspace.players.host()).id;
});

afterEach(async () => {
  await server.close();
});

type Socket = Awaited<ReturnType<typeof openSocket>>;

/** An engine knocks from `from`; the host, at the table in `hostSocket`, answers. */
async function knock(hostSocket: Socket, answer: string, from = '203.0.113.9') {
  const asking = fetch(`${server.url}/api/knock`, {
    method: 'POST',
    headers: { 'x-forwarded-for': from, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Referee' }),
  });
  const { prompts } = await hostSocket.nextOf('prompts');
  expect(prompts[0]).toMatchObject({ from: 'Trayful', title: 'An engine knocks', kind: 'choice' });
  hostSocket.send({ type: 'answer', prompt: prompts[0]!.id, answer: [answer] });
  const reply = await asking;
  return { status: reply.status, body: (await reply.json()) as Record<string, unknown> };
}

/** Connects as the engine a knock let in. */
function asEngine(body: Record<string, unknown>) {
  const { id } = body.player as { id: string };
  return openSocket(server.url, undefined, {
    ...REMOTE,
    authorization: `Bearer ${id}:${body.secret as string}`,
  });
}

/** Deals the host a card, so there is something an engine may or may not see. */
async function dealToHost(hostSocket: Socket) {
  hostSocket.send({
    type: 'command',
    command: { type: 'deal', from: DECK, to: [`hand:${host}`], count: 1 },
  });
  const { state } = await hostSocket.nextOf('state');
  return Object.values(state.objects).find((o) => o.kind === 'piece' && o.hand === host)!.id;
}

describe('engines', () => {
  it('knocks, is let in by the host, asks a player and hears the answer', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    const card = await dealToHost(table);
    const { status, body } = await knock(table, 'allow');
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'allowed', fullView: false, table: 'table-1' });

    const engine = await asEngine(body);
    const { state } = await engine.nextOf('state');
    expect(JSON.stringify(state)).not.toContain(card);
    expect(state.hands).toEqual({ [host]: 1 });

    engine.send({ type: 'follow' });
    expect(await engine.nextOf('events')).toMatchObject({ events: [] });
    engine.send({
      type: 'ask',
      to: [host],
      prompt: { kind: 'confirm', text: 'Ready?' },
      requestId: 'r1',
    });
    const asked = await engine.nextOf('asked');
    expect(asked).toMatchObject({ requestId: 'r1', to: [host], prompt: { from: 'Referee' } });

    let shown: Extract<ServerMessage, { type: 'prompts' }>;
    do shown = await table.nextOf('prompts');
    while (shown.prompts.length === 0);
    expect(shown.prompts.map((p) => p.id)).toEqual([asked.prompt.id]);
    table.send({ type: 'answer', prompt: asked.prompt.id, answer: true });
    let heard: Extract<ServerMessage, { type: 'events' }>;
    do heard = await engine.nextOf('events');
    while (heard.events[0]?.kind !== 'answered');
    expect(heard.events[0]).toMatchObject({ player: host, answer: true });

    expect(server.session.roster()).toContainEqual(
      expect.objectContaining({ name: 'Referee', role: 'engine', online: true }),
    );
    table.socket.close();
    engine.socket.close();
  });

  it('sees every hand only when the host allowed a full view', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    const card = await dealToHost(table);
    const { body } = await knock(table, 'allow-full-view');
    expect(body.fullView).toBe(true);
    const engine = await asEngine(body);
    const { state } = await engine.nextOf('state');
    expect(state.objects[card]).toMatchObject({ hand: host });
    table.socket.close();
    engine.socket.close();
  });

  it('turns away an engine the host denied, and makes it wait before knocking again', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    const { status, body } = await knock(table, 'deny');
    expect(status).toBe(403);
    expect(body).toMatchObject({ status: 'denied' });
    const again = await fetch(`${server.url}/api/knock`, {
      method: 'POST',
      headers: { ...REMOTE, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Referee' }),
    });
    expect(again.status).toBe(429);
    table.socket.close();
  });

  it('tells an engine when nobody answered its knock', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    const asking = fetch(`${server.url}/api/knock`, {
      method: 'POST',
      headers: { ...REMOTE, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Referee' }),
    });
    const { prompts } = await table.nextOf('prompts');
    server.session.prompts.cancel(prompts[0]!.id);
    const reply = await asking;
    expect(reply.status).toBe(408);
    expect(await reply.json()).toMatchObject({ status: 'expired' });
    table.socket.close();
  });

  it('lets only engines ask, and only withdraw their own prompts', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    table.send({ type: 'ask', to: [host], prompt: { kind: 'message', text: 'Hi' } });
    expect(await table.nextOf('error')).toMatchObject({
      message: 'Only an engine the host let in may do that.',
    });

    const engine = await asEngine((await knock(table, 'allow')).body);
    await engine.nextOf('state');
    const mine = server.session.prompts.ask({ kind: 'message', text: 'Hi' }, [host], 'Claude');
    engine.send({ type: 'cancel-prompt', prompt: mine.prompt.id });
    expect(await engine.nextOf('error')).toMatchObject({
      message: 'An engine may only withdraw the prompts it asked.',
    });
    engine.send({
      type: 'ask',
      to: ['nobody'],
      prompt: { kind: 'message', text: 'Hi' },
      requestId: 'r2',
    });
    expect(await engine.nextOf('error')).toMatchObject({ requestId: 'r2' });
    engine.send({ type: 'ask', to: [host] });
    expect((await engine.nextOf('error')).message).toMatch(/^Invalid message/);
    table.socket.close();
    engine.socket.close();
  });

  it('cuts off an engine the host sends away', async () => {
    const table = await openSocket(server.url);
    await table.nextOf('state');
    const { body } = await knock(table, 'allow');
    const engine = await asEngine(body);
    await engine.nextOf('state');
    const closed = new Promise((resolve) => engine.socket.once('close', resolve));
    const { id } = body.player as { id: string };

    const remote = await fetch(`${server.url}/api/engines/${id}`, {
      method: 'DELETE',
      headers: REMOTE,
    });
    expect(remote.status).toBe(403);
    const sent = await server.app.inject({ method: 'DELETE', url: `/api/engines/${id}` });
    expect(sent.statusCode).toBe(200);
    await closed;
    await expect(asEngine(body)).rejects.toThrow('403');
    table.socket.close();
  });

  it('refuses a knock with no name, or at a table that does not exist', async () => {
    const post = (body: Record<string, string>) =>
      server.app.inject({ method: 'POST', url: '/api/knock', headers: REMOTE, payload: body });
    expect((await post({ name: ' ' })).json()).toEqual({ error: 'Give a name to join with.' });
    expect((await post({ name: 'Bot', table: 'nope' })).statusCode).toBe(400);
  });
});
