import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { surfacesOf, type Piece } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../../src/mcp/server.js';
import { Workspace } from '../../src/projects/workspace.js';
import { examplePath } from '../paths.js';

interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

describe('MCP surface tools', () => {
  let workspace: Workspace;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { ...result, text: result.content[0]?.text ?? '' };
  };
  const state = () => workspace.active.engine.state;
  const piece = (id: string) => state().objects[id] as Piece;

  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-surfaces-'));
    const example = examplePath('harvest-moon');
    await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
    workspace = await Workspace.open(dir, { watch: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => workspace.close());

  it('adds a player area, fills it, seats the agent and describes it', async () => {
    const added = await call('add_surface', { id: 'red', name: 'Red player', seat: true });
    expect(JSON.parse(added.text).surfaces).toHaveLength(2);
    await call('move', { ids: ['worker.red.1'], to: 'surface:red' });
    await call('draw', { from: 'deck:actions', count: 2, to: [0, 60], surface: 'red' });
    await call('deal', { from: 'deck:actions', to: 'surface:red' });
    await call('sit', { surface: 'red', player: 'claude' });
    expect(piece('worker.red.1').surface).toBe('red');
    expect(surfacesOf(state())[1]).toMatchObject({ player: 'claude' });

    const red = (await call('describe_table', { surface: 'red' })).text;
    expect(red).toContain('- red: Red player, seat, claude sits here, 3 objects');
    expect(red).not.toContain('coins');
    const found = JSON.parse((await call('query_objects', { surface: 'red' })).text);
    expect(found).toHaveLength(3);

    await call('edit_surface', { id: 'red', name: 'Rouge' });
    expect(surfacesOf(state())[1]!.name).toBe('Rouge');
    await call('remove_surface', { id: 'red', to: 'centre' });
    expect(surfacesOf(state())).toHaveLength(1);
    expect(piece('worker.red.1')).not.toHaveProperty('surface');
  });

  it('explains what it cannot do', async () => {
    const unknown = await call('describe_table', { surface: 'nope' });
    expect(unknown).toMatchObject({ isError: true });
    const bad = await call('move', { ids: ['coins'], to: [0, 0], surface: 'nope' });
    expect(bad).toMatchObject({ isError: true });
    expect(bad.text).toContain('no surface "nope"');
  });
});
