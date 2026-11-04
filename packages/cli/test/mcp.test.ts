import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Stack } from '@trayful/core';
import { startServer } from '@trayful/server';
import { describe, expect, it, vi } from 'vitest';
import { mcp } from './mcp.js';
import { scratchExamples, scratchProject } from './testing.js';

/**
 * Runs `trayful mcp` in this process with a client on its stdin and stdout. Returns the
 * client, what it told people, and its exit code once the client hangs up.
 */
async function connect(dir: string, port: number) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const messages: string[] = [];
  const exit = mcp({ dir, port }, (s) => messages.push(s), { stdin, stdout });
  const client = new Client({ name: 'test', version: '0' });
  // Stdio is newline-delimited JSON both ways, so the server transport also serves the client.
  await client.connect(new StdioServerTransport(stdout, stdin));
  const close = async () => {
    await client.close();
    stdin.end();
    return exit;
  };
  return { client, messages, close };
}

describe('trayful mcp', () => {
  it('opens the table itself when nothing is running', async () => {
    const { client, messages, close } = await connect(await scratchProject(), 4391);
    const result = (await client.callTool({ name: 'describe_table' })) as {
      content: { text: string }[];
    };
    expect(result.content[0]!.text).toContain('deck:actions: 5 ×');
    // People can watch the same table in a browser while the agent plays.
    expect(messages).toEqual(['Harvest Moon: watch the table at http://127.0.0.1:4391']);
    const health = (await (await fetch('http://127.0.0.1:4391/api/health')).json()) as {
      project: string;
    };
    expect(health.project).toBe('Harvest Moon');
    expect(await close()).toBe(0);
  });

  it('relays to a table that trayful play already has open', async () => {
    const dir = await scratchProject();
    const server = await startServer({ projectDir: dir, port: 4392, appDir: '/nonexistent' });
    try {
      const { client, messages, close } = await connect(dir, 4392);
      await client.callTool({ name: 'draw', arguments: { from: 'deck:actions', to: [0, 300] } });
      expect((server.session.engine.state.objects['deck:actions'] as Stack).items).toHaveLength(4);
      expect(messages).toEqual(['Connecting to the open table at http://127.0.0.1:4392']);
      expect(await close()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('will not join a different project on the same port', async () => {
    const server = await startServer({
      projectDir: await scratchExamples(),
      port: 4393,
      appDir: '/nonexistent',
    });
    try {
      await expect(mcp({ dir: await scratchProject(), port: 4393 }, vi.fn())).rejects.toThrow(
        /^Port 4393 already has "Harvest Moon" \(table table-1\) open\./,
      );
    } finally {
      await server.close();
    }
  });
});
