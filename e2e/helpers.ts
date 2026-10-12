import type { Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TableState } from '@trayful/core';

declare global {
  // The test hook the app installs; see packages/app/src/App.tsx.
  interface Window {
    __trayful?: {
      store: { getState(): { status: string; selection: string[] } };
      worldToScreen(x: number, y: number): { x: number; y: number };
    };
  }
}

export const DECK = 'deck:actions';

export async function table(page: Page): Promise<TableState> {
  const response = await page.request.get('/api/table');
  return (await response.json()) as TableState;
}

/** Screen position of a table point, in millimetres. */
export async function screen(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => window.__trayful!.worldToScreen(x!, y!), [x, y]);
}

export async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from);
  const b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

/** An MCP client connected to the test server, like an agent would be. */
export async function agent(baseURL: string) {
  const client = new Client({ name: 'e2e-agent', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`)));
  return {
    client,
    async call(name: string, args: Record<string, unknown> = {}) {
      const result = (await client.callTool({ name, arguments: args })) as {
        content: { type: string; text?: string; data?: string }[];
        isError?: boolean;
      };
      if (result.isError) throw new Error(`${name} failed: ${result.content[0]?.text}`);
      return result;
    },
  };
}

/** Puts the table back to how it starts, so tests do not depend on each other. */
export async function freshTable(baseURL: string) {
  const a = await agent(baseURL);
  await a.call('reset_table', { seed: 1 });
  await a.client.close();
}

export async function openTable(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
}
