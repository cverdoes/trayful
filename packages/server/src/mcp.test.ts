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
import type { TableSession } from './session.js';
import { Workspace } from './workspace.js';
import { frameText } from './frames.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

async function scratchProject(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return dir;
}

interface ToolResult {
  content: { type: string; text?: string; data?: string }[];
  isError?: boolean;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  return { ...result, text: result.content[0]?.text ?? '' };
}

describe('MCP tools', () => {
  let workspace: Workspace;
  let session: TableSession;
  let client: Client;

  beforeEach(async () => {
    workspace = await Workspace.open(await scratchProject(), { seed: 3, watch: false });
    session = workspace.active;
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => workspace.close());

  it('lists the play, query and history tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_asset',
        'create_project',
        'deal',
        'delete_table',
        'describe_table',
        'draw',
        'duplicate_table',
        'flip',
        'get_history',
        'layout',
        'list_projects',
        'lock',
        'migrate_project',
        'move',
        'open_table',
        'query_objects',
        'redo',
        'remove_type',
        'rename_field',
        'rename_image',
        'rename_type',
        'render_component',
        'reset_table',
        'roll',
        'rotate',
        'set_color',
        'set_counter',
        'set_inventory',
        'shuffle',
        'snapshot',
        'stack',
        'take',
        'undo',
        'upsert_type',
        'validate_project',
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

  it('deals a round, shows it to watchers, and undoes only its own changes', async () => {
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

    // A person cannot undo the agent's deal; the agent can.
    const dealt = session.engine.state;
    session.handle({ type: 'undo' }, 'root');
    expect(session.engine.state).toBe(dealt);
    expect((await call(client, 'undo')).isError).toBeFalsy();
    expect((session.engine.state.objects[DECK] as Stack).items).toHaveLength(5);
    expect((await call(client, 'get_history')).text).toContain('shuffle');
  });

  it("plays from its own hand and never sees other players' hands", async () => {
    expect((await call(client, 'draw', { from: DECK, to: 'hand:bob' })).text).toMatch(
      /no player "bob"/,
    );
    await workspace.players.join('Bob', 'guest');
    const r = await call(client, 'deal', { from: DECK, to: ['hand:claude', 'hand:bob'], count: 2 });
    expect(r.isError).toBeFalsy();
    const described = (await call(client, 'describe_table', { reveal: true })).text;
    expect(described).toContain('Your hand (hand:claude; only you see these):');
    expect(described).toContain("Other players' hands");
    expect(described).toContain('bob 2');
    const bobs = Object.values(session.engine.state.objects).filter(
      (o) => o.kind === 'piece' && o.hand === 'bob',
    );
    for (const card of bobs) expect(described).not.toContain(card.id);

    const mine = JSON.parse(
      (await call(client, 'query_objects', { inside: 'hand:claude' })).text,
    ) as { id: string; top: { data?: object } }[];
    expect(mine).toHaveLength(2);
    expect(mine[0]!.top.data).toBeDefined();
    expect((await call(client, 'query_objects', { inside: 'hand:bob' })).isError).toBe(true);
    const grab = await call(client, 'move', { ids: [bobs[0]!.id], to: [0, 0] });
    expect(grab).toMatchObject({ isError: true, text: expect.stringContaining('another player') });

    const play = await call(client, 'move', { ids: [mine[0]!.id], to: [50, 300] });
    expect(play.isError).toBeFalsy();
    expect(session.engine.state.objects[mine[0]!.id]).toMatchObject({ pos: [50, 300], face: 'up' });
    const history = (await call(client, 'get_history')).text;
    for (const card of bobs) expect(history).not.toContain(card.id);
    const state = await client.readResource({
      uri: `trayful://project/${session.projectId}/tables/table-1/state`,
    });
    const text = (state.contents[0] as { text: string }).text;
    for (const card of bobs) expect(text).not.toContain(`"${card.id}"`);
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
    expect(r.text).toContain('"coins" cannot be rolled.');
    expect(session.engine.state).toBe(before);
  });

  it('serves table state, project and component types as resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    const id = path.basename(session.project.dir);
    expect(uris).toContain(`trayful://project/${id}/tables/table-1/state`);
    expect(uris).toContain('trayful://docs');
    expect(uris).toContain(
      `trayful://project/${path.basename(session.project.dir)}/types/action-card`,
    );
    const state = await client.readResource({
      uri: `trayful://project/${id}/tables/table-1/state`,
    });
    expect(
      JSON.parse((state.contents[0] as { text: string }).text).objects[DECK].items,
    ).toHaveLength(5);
  });

  it('opens, duplicates and deletes tables', async () => {
    const opened = await call(client, 'open_table', { table: 'empty', setup: false });
    expect(opened.text).toMatch(/^Created table "empty"/);
    expect(workspace.active.tableName).toBe('empty');
    expect((await call(client, 'duplicate_table', { to: 'copy' })).isError).toBeFalsy();
    const list = JSON.parse((await call(client, 'list_projects')).text);
    expect(list.active.table).toBe('empty');
    expect(list.projects[0].tables).toEqual(['copy', 'empty', 'table-1']);
    expect((await call(client, 'delete_table', { table: 'empty' })).text).toMatch(/open another/);
    expect((await call(client, 'delete_table', { table: 'copy' })).isError).toBeFalsy();
    expect((await call(client, 'create_project', { name: 'X' })).text).toMatch(
      /folder of projects/,
    );
    expect((await call(client, 'validate_project')).text).toMatch(/loads cleanly/);
  });

  it('designs a component type and puts it in the box', async () => {
    const added = await call(client, 'upsert_type', {
      definition: {
        id: 'event-card',
        is: 'piece',
        size: [63, 88],
        flippable: true,
        stackable: true,
        fields: { title: 'string' },
        face: { fill: '#ffffff', labels: [{ field: 'title', at: [5, 5] }] },
      },
    });
    expect(added.text).toMatch(/Added type "event-card" in library\/cards\.yaml/);
    const box = await call(client, 'set_inventory', {
      type: 'event-card',
      entries: [{ deck: 'events', items: [{ title: 'Storm', count: 2 }, { title: 'Feast' }] }],
    });
    expect(box.text).toMatch(/3 "event-card" components/);
    expect((session.engine.state.objects['deck:events'] as Stack).items).toHaveLength(3);

    const broken = await call(client, 'upsert_type', {
      definition: { id: 'event-card', is: 'piece', size: [63, 88] },
    });
    expect(broken.isError).toBe(true);
    expect(broken.text).toMatch(/would break the project/);
  });

  it('serves the docs to agents', async () => {
    const index = await client.readResource({ uri: 'trayful://docs' });
    const text = (index.contents[0] as { text: string }).text;
    expect(text).toContain('howto/');
    const page = await client.readResource({ uri: 'trayful://docs/reference/library.md' });
    expect((page.contents[0] as { text: string }).text).toContain('# Library');
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
      const message = JSON.parse(frameText(data)) as ServerMessage;
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
    // The table is open in the browser once its first state arrives.
    await new Promise((resolve) => browser.once('message', resolve));

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

  it('asks the browser to draw a component type', async () => {
    const browser = new WebSocket(server.url.replace('http', 'ws') + '/ws');
    const requests: unknown[] = [];
    browser.on('message', (data) => {
      const message = JSON.parse(frameText(data)) as ServerMessage;
      if (message.type === 'render-request') {
        requests.push(message.component);
        browser.send(JSON.stringify({ type: 'snapshot', id: message.id, png: 'cG5nIQ==' }));
      }
    });
    // The table is open in the browser once its first state arrives.
    await new Promise((resolve) => browser.once('message', resolve));
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
    const picture = await call(client, 'render_component', { type: 'worker', face: 'up' });
    expect(picture.content[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
    expect(requests).toEqual([{ type: 'worker', data: { color: 'red' }, face: 'up' }]);
    expect((await call(client, 'render_component', { type: 'nope' })).isError).toBe(true);
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
