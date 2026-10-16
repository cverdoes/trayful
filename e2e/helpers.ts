import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { TableState } from '@trayful/core';

declare global {
  // The test hook the app installs; see packages/app/src/App.tsx.
  interface Window {
    __trayful?: {
      store: { getState(): { status: string; selection: string[] } };
      worldToScreen(x: number, y: number): { x: number; y: number };
      faceToScreen?(side: 'front' | 'back', x: number, y: number): { x: number; y: number };
    };
  }
}

export const DECK = 'deck:actions';

/**
 * The whole table with real ids, as an agent reads it. The page itself shows
 * face-down cards under stand-in ids, which change when they are turned up.
 */
export async function table(
  page: Page,
  project = 'harvest-moon',
  name = 'table-1',
): Promise<TableState> {
  const { client } = await agent(new URL(page.url()).origin);
  try {
    const result = await client.readResource({
      uri: `trayful://project/${project}/tables/${name}/state`,
    });
    return JSON.parse((result.contents[0] as { text: string }).text) as TableState;
  } finally {
    await client.close();
  }
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

/**
 * Puts the table back to how it starts, so tests do not depend on each other:
 * set up for two players, or with `setup: false` everything straight out of the box.
 */
export async function freshTable(baseURL: string, setup?: string | false) {
  const a = await agent(baseURL);
  await a.call('reset_table', { seed: 1, ...(setup === undefined ? {} : { setup }) });
  await a.client.close();
}

export async function openTable(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
}

/**
 * The host invites players to the table open on their page, and a guest joins
 * through the link in a browser of their own. Close the guest's context when done.
 */
export async function inviteGuest(host: Page, browser: Browser, name: string) {
  await host.getByRole('button', { name: 'Invite players to this table' }).click();
  await expect(host.getByRole('dialog', { name: 'Invite players' })).toContainText(
    'only reachable',
  );
  await host.getByRole('button', { name: 'Close' }).click();
  const params = new URL(host.url()).searchParams;
  const { root } = (await (await host.request.get('/api/health')).json()) as { root: string };
  const { invites } = JSON.parse(
    await readFile(path.join(root, '.trayful', 'players.json'), 'utf8'),
  ) as { invites: { token: string; project: string; table: string }[] };
  const invite = invites.findLast((i) => i.table === (params.get('table') ?? 'table-1'))!.token;

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guest = await context.newPage();
  await guest.goto(`/join/${invite}`);
  await guest.getByLabel('Your name').fill(name);
  await guest.getByRole('button', { name: 'Join' }).click();
  await guest.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(guest).not.toHaveURL(/join/);
  await expect(host.getByRole('list', { name: 'Players' })).toContainText(name);
  return { context, guest };
}

export type Point = [number, number];

/** Where a point on the front face in the designer, in millimetres, is on the page. */
export function onFront(page: Page, [x, y]: Point) {
  return page.evaluate(([x, y]) => window.__trayful!.faceToScreen!('front', x!, y!), [x, y]);
}

export async function dragOnFront(page: Page, from: Point, to: Point) {
  const a = await onFront(page, from);
  const b = await onFront(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

export async function clickOnFront(page: Page, at: Point) {
  const p = await onFront(page, at);
  await page.mouse.click(p.x, p.y);
}

/** A file of a project, as the server has written it. */
export async function libraryFile(page: Page, project: string, file: string): Promise<string> {
  const health = (await (await page.request.get('/api/health')).json()) as { root: string };
  return readFile(path.join(health.root, project, file), 'utf8');
}

export async function waitSaved(page: Page) {
  await expect(page.getByRole('status')).toContainText('Saved to');
}

/** Makes a component in the designer: its name, what to start like, and what it is. */
export async function newComponent(page: Page, name: string, startLike: string) {
  await page.getByRole('button', { name: '+ New component' }).click();
  const dialog = page.getByRole('dialog', { name: 'New component' });
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByLabel(startLike, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await waitSaved(page);
}

interface SavedType {
  is?: string;
  container?: unknown;
  stackable?: unknown;
  values?: unknown;
  face?: { image?: unknown; layers?: unknown[] };
}

/** The component as the table has it, once a save has reached it. */
export function savedType(page: Page, id: string) {
  return page.evaluate(
    (id) =>
      (
        window.__trayful!.store.getState() as unknown as {
          view?: { types: Record<string, SavedType> };
        }
      ).view?.types[id],
    id,
  );
}
