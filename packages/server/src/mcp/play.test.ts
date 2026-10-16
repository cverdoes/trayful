import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Piece, Stack } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp.js';
import type { TableSession } from '../session.js';
import { Workspace } from '../workspace.js';

const example = fileURLToPath(new URL('../../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

describe('MCP play tools', () => {
  let workspace: Workspace;
  let session: TableSession;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { ...result, text: result.content[0]?.text ?? '' };
  };
  const piece = (id: string) => session.engine.state.objects[id] as Piece;

  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-play-'));
    await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
    workspace = await Workspace.open(dir, { seed: 3, setup: false, watch: false });
    session = workspace.active;
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => workspace.close());

  it('turns, rolls, sets and locks pieces', async () => {
    await call('rotate', { ids: ['worker.red.1'], steps: 1 });
    expect(piece('worker.red.1').rot).toBe(90);
    expect((await call('roll', { ids: ['d6.1', 'd6.2'] })).isError).toBeFalsy();
    await call('set_counter', { id: 'coins', value: 7 });
    expect(piece('coins').value).toBe(7);
    await call('lock', { ids: ['coins'] });
    expect(piece('coins').locked).toBe(true);
    await call('lock', { ids: ['coins'], locked: false });
    expect(piece('coins').locked).toBeUndefined();
    await call('flip', { ids: [DECK] });
    expect((await call('stack', { ids: ['worker.red.1'], onto: 'worker.red.2' })).isError).toBe(
      true,
    );
  });

  it('lays out, draws from and redoes changes to a pile', async () => {
    await call('layout', { id: DECK, layout: 'spread' });
    expect((session.engine.state.objects[DECK] as Stack).layout).toBe('spread');
    const drawn = await call('draw', { from: DECK, count: 2, to: [400, 0], face: 'up' });
    expect(drawn.isError).toBeFalsy();
    await call('undo');
    expect((session.engine.state.objects[DECK] as Stack).items).toHaveLength(10);
    expect(JSON.parse((await call('redo')).text).changed.length).toBeGreaterThan(0);
    expect((await call('redo')).text).toBe('Nothing of yours to redo.');
  });

  it('says when there is nothing to undo, and when a deal cannot be counted', async () => {
    expect((await call('undo')).text).toBe('Nothing of yours to undo.');
    const bad = await call('deal', { from: DECK, to: 'nowhere/spots' });
    expect(bad.isError).toBe(true);
  });

  it('serves a project manifest and the schemas, and refuses unknown types', async () => {
    const id = session.projectId;
    const manifest = await client.readResource({ uri: `trayful://project/${id}/manifest` });
    expect(JSON.parse((manifest.contents[0] as { text: string }).text).types).toContain('coins');
    const schema = await client.readResource({ uri: 'trayful://schema' });
    expect((schema.contents[0] as { text: string }).text).toContain('library');
    await expect(
      client.readResource({ uri: `trayful://project/${id}/types/lantern` }),
    ).rejects.toThrow('No component type "lantern"');
    const type = await client.readResource({ uri: `trayful://project/${id}/types/coins` });
    expect(JSON.parse((type.contents[0] as { text: string }).text)).toMatchObject({
      id: 'coins',
      file: expect.stringContaining('pieces.yaml'),
    });
  });

  it('writes assets, removes types and explains a missing render', async () => {
    const asset = await call('add_asset', { path: 'assets/dot.svg', text: '<svg/>' });
    expect(asset.text).toMatch(/Wrote assets\/dot\.svg/);
    const used = await call('remove_type', { type: 'coins' });
    expect(used.isError).toBe(true);
    const render = await call('render_component', { type: 'lantern' });
    expect(render.text).toBe('There is no type "lantern" in this project.');
    expect((await call('render_component', { type: 'coins' })).text).toMatch(/No browser/);
  });

  it('renames a type everywhere it is used, and explains a name that is taken', async () => {
    const renamed = await call('rename_type', { type: 'worker', to: 'farmer' });
    expect(renamed.text).toMatch(
      /^Renamed type "worker" to "farmer" in library\/pieces\.yaml, inventory\.yaml, setups\/2-player\.yaml\./,
    );
    expect(piece('farmer.red.1').type).toBe('farmer');
    const taken = await call('rename_type', { type: 'farmer', to: 'd6' });
    expect(taken).toMatchObject({
      isError: true,
      text: expect.stringMatching(/already a component "d6"/),
    });
  });
});
