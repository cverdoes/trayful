import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ServerMessage, Stack } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createMcpServer } from './mcp.js';
import { startServer, type RunningServer } from './server.js';
import { TableSession } from './session.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

async function scratchProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return dir;
}

type ToolResult = { content: { type: string; text?: string; data?: string }[]; isError?: boolean };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { ...result, text: result.content[0]?.text ?? '' };
}

describe('MCP tools', () => {
  let session: TableSession;
  let client: Client;

  beforeEach(async () => {
    session = await TableSession.open(await scratchProject(), 'table-1', { seed: 3 });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(session).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => session.close());

  it('lists the play, query and history tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'deal',
        'describe_table',
        'draw',
        'flip',
        'get_history',
        'layout',
        'lock',
        'move',
        'query_objects',
        'redo',
        'reset_table',
        'roll',
        'rotate',
        'set_counter',
        'shuffle',
        'snapshot',
        'stack',
        'take',
        'undo',
      ].sort(),
    );
  });

  it('describes the table without peeking at face-down cards', async () => {
    const r = await call(client, 'describe_table');
    expect(r.text).toContain('deck:actions: 5 × Action card');
    expect(r.text).toContain('top face down');
    expect(r.text).not.toContain('bottom to top');
    expect((await call(client, 'describe_table', { reveal: true })).text).toContain(
      'bottom to top',
    );
  });

  it('deals a round, shows it to watchers and shares undo with the browser', async () => {
    const seen: ServerMessage[] = [];
    session.subscribe((m) => seen.push(m));
    await call(client, 'shuffle', { id: DECK });
    const r = await call(client, 'deal', {
      from: DECK,
      to: [
        [0, 200],
        [100, 200],
      ],
      count: 2,
      face: 'up',
    });
    expect(r.isError).toBeFalsy();
    const { changed } = JSON.parse(r.text) as {
      changed: { id: string; count?: number; top: { data?: object } }[];
    };
    expect(changed.filter((c) => c.count === 2)).toHaveLength(2);
    expect(changed.find((c) => c.count === 2)!.top.data).toBeDefined();
    expect(seen.at(-1)).toMatchObject({
      type: 'state',
      activity: { by: 'agent', text: 'dealt 4 cards' },
    });

    // A person undoes the deal from the browser; the agent sees the deck whole again.
    session.handle({ type: 'undo' });
    expect((session.engine.state.objects[DECK] as Stack).items).toHaveLength(5);
    expect((await call(client, 'get_history')).text).toContain('shuffle');
  });

  it('places workers on snap spots, deals into a target and takes a card from a pile', async () => {
    const moved = await call(client, 'move', { ids: ['worker.red.1'], to: 'main-board/fields/3' });
    expect(moved.isError).toBeFalsy();
    expect(session.engine.state.objects['worker.red.1']!.snap).toBe('main-board/fields/3');
    expect((await call(client, 'describe_table')).text).toContain('taken 3: worker.red.1');

    const wrong = await call(client, 'move', { ids: ['worker.red.2'], to: 'main-board/market/0' });
    expect(wrong.isError).toBe(true);
    expect(wrong.text).toContain('only accepts action-card');

    const laid = await call(client, 'layout', { id: DECK, layout: 'spread' });
    expect(laid.isError).toBeFalsy();
    const card = (session.engine.state.objects[DECK] as Stack).items[1]!;
    const taken = await call(client, 'take', { id: card, to: [0, 300], face: 'up' });
    expect(taken.isError).toBeFalsy();
    expect((session.engine.state.objects[DECK] as Stack).items).not.toContain(card);
  });

  it('starts a new table from a named setup, or straight out of the box', async () => {
    await call(client, 'reset_table', { setup: false });
    expect((session.engine.state.objects[DECK] as Stack).items).toHaveLength(10);
    await call(client, 'reset_table', { setup: '2-player' });
    expect((session.engine.state.objects[DECK] as Stack).items).toHaveLength(5);
    const bad = await call(client, 'reset_table', { setup: 'solo' });
    expect(bad.isError).toBe(true);
    expect(bad.text).toContain('Unknown setup "solo"');
  });

  it('reports bad moves as tool errors and changes nothing', async () => {
    const before = session.engine.state;
    const r = await call(client, 'roll', { ids: ['d6.1', 'coins'] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('not a die');
    expect(session.engine.state).toBe(before);
  });

  it('serves table state, project and component types as resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain('trayful://table/table-1/state');
    expect(uris).toContain(
      `trayful://project/${path.basename(session.project.dir)}/types/action-card`,
    );
    const state = await client.readResource({ uri: 'trayful://table/table-1/state' });
    expect(
      JSON.parse((state.contents[0] as { text: string }).text).objects[DECK].items,
    ).toHaveLength(5);
  });

  it('says why a snapshot is not possible without a browser', async () => {
    const r = await call(client, 'snapshot');
    expect(r.isError).toBe(true);
    expect(r.text).toContain('No browser');
  });
});

describe('MCP over HTTP', () => {
  let server: RunningServer;
  beforeEach(async () => {
    server = await startServer({
      projectDir: await scratchProject(),
      port: 0,
      seed: 3,
      appDir: '/nonexistent',
    });
  });
  afterEach(() => server.close());

  it('plays on the same table as the browser, and gets snapshots from it', async () => {
    // A stand-in browser that answers snapshot requests with a tiny PNG.
    const browser = new WebSocket(server.url.replace('http', 'ws') + '/ws');
    browser.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === 'snapshot-request') {
        browser.send(
          JSON.stringify({
            type: 'snapshot',
            id: message.id,
            png: Buffer.from('png!').toString('base64'),
          }),
        );
      }
    });
    await new Promise((resolve) => browser.once('open', resolve));

    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
    await call(client, 'draw', { from: DECK, to: [0, 300], face: 'up' });
    expect((server.session.engine.state.objects[DECK] as Stack).items).toHaveLength(4);

    const snap = await call(client, 'snapshot');
    expect(snap.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(Buffer.from(snap.content[0]!.data!, 'base64').toString()).toBe('png!');

    await client.close();
    browser.close();
  });

  it('refuses MCP requests from other websites', async () => {
    const response = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });
});
