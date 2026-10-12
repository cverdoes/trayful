import { expect, test, type Page } from '@playwright/test';
import type { Piece, Stack, TableState } from '@trayful/core';

declare global {
  // The test hook the app installs; see packages/app/src/App.tsx.
  interface Window {
    __trayful?: {
      store: { getState(): { status: string; selection: string[] } };
      worldToScreen(x: number, y: number): { x: number; y: number };
    };
  }
}

const DECK = 'deck:actions';

async function table(page: Page): Promise<TableState> {
  const response = await page.request.get('/api/table');
  return (await response.json()) as TableState;
}

/** Screen position of a table point, in millimetres. */
async function screen(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => window.__trayful!.worldToScreen(x!, y!), [x, y]);
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from);
  const b = await screen(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test('plays a hand: draw, flip, undo, shuffle and restack', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(page.locator('.toolbar')).toContainText('Harvest Moon');

  const deck = (await table(page)).objects[DECK] as Stack;
  expect(deck.items).toHaveLength(10);
  const top = deck.items.at(-1)!;

  // Drag the top card off the deck onto empty table.
  await drag(page, [deck.pos[0], deck.pos[1]], [deck.pos[0], deck.pos[1] + 110]);
  await expect.poll(async () => ((await table(page)).objects[DECK] as Stack).items.length).toBe(9);
  const drawn = (await table(page)).objects[top] as Piece;
  expect(drawn.parent).toBeUndefined();
  expect(drawn.pos[1]).toBeCloseTo(deck.pos[1] + 110, 0);

  // Select it and flip it with the keyboard, then undo the flip.
  const faceBefore = drawn.face;
  await drag(page, [drawn.pos[0], drawn.pos[1]], [drawn.pos[0], drawn.pos[1]]);
  await expect
    .poll(() => page.evaluate(() => window.__trayful!.store.getState().selection))
    .toEqual([top]);
  await page.keyboard.press('f');
  await expect
    .poll(async () => ((await table(page)).objects[top] as Piece).face)
    .not.toBe(faceBefore);
  await page.screenshot({ path: 'test-results/flipped.png' });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => ((await table(page)).objects[top] as Piece).face).toBe(faceBefore);

  // Shuffle the deck from the toolbar.
  const order = ((await table(page)).objects[DECK] as Stack).items;
  await drag(page, [deck.pos[0], deck.pos[1]], [deck.pos[0], deck.pos[1]]);
  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect
    .poll(async () => ((await table(page)).objects[DECK] as Stack).items)
    .not.toEqual(order);

  // Drop the drawn card back on the deck.
  await drag(page, [drawn.pos[0], drawn.pos[1]], [deck.pos[0], deck.pos[1]]);
  await expect
    .poll(async () => ((await table(page)).objects[DECK] as Stack).items.at(-1))
    .toBe(top);

  await page.screenshot({ path: 'test-results/table.png' });
});
