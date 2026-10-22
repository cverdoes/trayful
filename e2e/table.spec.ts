import { expect, test, type Page } from '@playwright/test';
import type { Piece, Stack } from '@trayful/core';
import { DECK, drag, freshTable, openTable, screen, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!));

test('plays a hand: draw, flip, undo, shuffle and restack', async ({ page }) => {
  await openTable(page);
  await expect(page.locator('.toolbar')).toContainText('Harvest Moon');

  const deck = (await table(page)).objects[DECK] as Stack;
  expect(deck.items).toHaveLength(5);
  const top = deck.items.at(-1)!;

  // Drag the top card off the deck onto empty table.
  await drag(page, [deck.pos[0], deck.pos[1]], [deck.pos[0], deck.pos[1] + 110]);
  await expect.poll(async () => ((await table(page)).objects[DECK] as Stack).items.length).toBe(4);
  const drawn = (await table(page)).objects[top] as Piece;
  expect(drawn.parent).toBeUndefined();
  expect(drawn.pos[1]).toBeCloseTo(deck.pos[1] + 110, 0);

  // Select it and flip it with the keyboard, then undo the flip.
  const faceBefore = drawn.face;
  await drag(page, [drawn.pos[0], drawn.pos[1]], [drawn.pos[0], drawn.pos[1]]);
  await expect
    .poll(() => page.evaluate(() => window.__trayful!.store.getState().selection))
    .toHaveLength(1);
  await page.keyboard.press('f');
  await expect
    .poll(async () => ((await table(page)).objects[top] as Piece).face)
    .not.toBe(faceBefore);
  await page.screenshot({ path: 'test-results/flipped.png' });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => ((await table(page)).objects[top] as Piece).face).toBe(faceBefore);

  // Point at the card and flip it with the keyboard, without selecting it.
  await page.keyboard.press('Escape');
  const at = await screen(page, drawn.pos[0], drawn.pos[1]);
  await page.mouse.move(at.x + 5, at.y + 5);
  // The page knows a face-down card by a stand-in id, so only check that something lit up.
  await expect.poll(() => hovered(page)).toBeDefined();
  await page.keyboard.press('f');
  await expect
    .poll(async () => ((await table(page)).objects[top] as Piece).face)
    .not.toBe(faceBefore);
  expect(await page.evaluate(() => window.__trayful!.store.getState().selection)).toEqual([]);
  await page.keyboard.press('f');
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

const hovered = (page: Page) => page.evaluate(() => window.__trayful!.store.getState().hovered);
