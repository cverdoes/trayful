import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Stack } from '@trayful/core';
import { startServer } from '@trayful/server';
import { describe, expect, it } from 'vitest';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const bin = fileURLToPath(new URL('../bin/trayful.js', import.meta.url));

async function scratchProject(): Promise<string> {
  const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-cli-')), 'harvest-moon');
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return dir;
}

async function connect(dir: string, port: number) {
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [bin, 'mcp', dir, '--port', String(port)],
      stderr: 'pipe',
    }),
  );
  return client;
}

describe('trayful mcp', () => {
  it('opens the table itself when nothing is running', async () => {
    const client = await connect(await scratchProject(), 4391);
    const result = (await client.callTool({ name: 'describe_table' })) as {
      content: { text: string }[];
    };
    expect(result.content[0]!.text).toContain('deck:actions: 5 ×');
    // People can watch the same table in a browser while the agent plays.
    const health = (await (await fetch('http://127.0.0.1:4391/api/health')).json()) as {
      project: string;
    };
    expect(health.project).toBe('Harvest Moon');
    await client.close();
  }, 20_000);

  it('relays to a table that trayful play already has open', async () => {
    const dir = await scratchProject();
    const server = await startServer({ projectDir: dir, port: 4392, appDir: '/nonexistent' });
    try {
      const client = await connect(dir, 4392);
      await client.callTool({ name: 'draw', arguments: { from: 'deck:actions', to: [0, 300] } });
      expect((server.session.engine.state.objects['deck:actions'] as Stack).items).toHaveLength(4);
      await client.close();
    } finally {
      await server.close();
    }
  }, 20_000);
});
