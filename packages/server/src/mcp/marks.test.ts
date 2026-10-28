import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Piece } from '@trayful/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../mcp.js';
import { Workspace } from '../workspace.js';

const example = fileURLToPath(new URL('../../../../examples/roll-and-write', import.meta.url));

interface ToolResult {
  content: { type: string; text?: string }[];
  isError?: boolean;
}

describe('MCP stamp and text tools', () => {
  let workspace: Workspace;
  let client: Client;

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    return { ...result, text: result.content[0]?.text ?? '' };
  };
  const sheet = () => workspace.active.engine.state.objects['sheet.1'] as Piece;

  beforeEach(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-mcp-marks-'));
    await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
    workspace = await Workspace.open(dir, { watch: false });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(workspace).connect(a);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
  });
  afterEach(() => workspace.close());

  it('stamps, writes, erases and undoes, and tells the agent what is where', async () => {
    const stamped = await call('mark', { at: 'sheet.1/boxes/7', stamp: 'ring' });
    expect(JSON.parse(stamped.text).changed[0].marks).toEqual({ 'boxes/7': { stamp: 'ring' } });
    // Text that looks like a hidden piece or a hand is still only text.
    await call('mark', { at: 'sheet.1/name/0', text: 'hand:nobody' });
    expect(sheet().marks?.['name/0']).toEqual({ text: 'hand:nobody' });
    const described = (await call('describe_table')).text;
    expect(described).toContain(
      '- sheet.1/boxes: 36 stamp spots (stamps ring, cross), marked 7: ring',
    );
    expect(described).toContain('- sheet.1/name: 1 text spot, marked 0: "hand:nobody"');

    await call('erase', { at: 'sheet.1/name/0' });
    expect(sheet().marks).toEqual({ 'boxes/7': { stamp: 'ring' } });
    await call('undo');
    expect(sheet().marks?.['name/0']).toEqual({ text: 'hand:nobody' });
  });

  it('explains a mark the spot does not take', async () => {
    const wrong = await call('mark', { at: 'sheet.1/score/0', stamp: 'ring' });
    expect(wrong).toMatchObject({
      isError: true,
      text: '"sheet.1/score/0" takes text, not a stamp.',
    });
    const empty = await call('erase', { at: 'sheet.1/boxes/0' });
    expect(empty).toMatchObject({ isError: true, text: '"sheet.1/boxes/0" has nothing to erase.' });
  });
});
