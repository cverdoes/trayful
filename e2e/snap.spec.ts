import { expect, test } from '@playwright/test';
import type { Piece, Stack } from '@trayful/core';
import { DECK, drag, freshTable, openTable, screen, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!));

const piece = async (page: Parameters<typeof table>[0], id: string) =>
  (await table(page)).objects[id] as Piece;

test('a worker snaps onto a field and rides along when the board moves', async ({ page }) => {
  await openTable(page);
  const worker = await piece(page, 'worker.red.1');
  expect(worker.snap).toBeUndefined();

  // Field spot 2 is at [-90, 0]; dropping close by snaps the worker into it.
  const from = await screen(page, worker.pos[0], worker.pos[1]);
  const to = await screen(page, -86, 5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  // While dragging, the fields the worker may go to are outlined and the nearest one filled.
  await page.screenshot({ path: 'test-results/snap-hints.png' });
  await page.mouse.up();
  await expect
    .poll(async () => (await piece(page, 'worker.red.1')).snap)
    .toBe('main-board/fields/2');
  expect((await piece(page, 'worker.red.1')).pos).toEqual([-90, 0]);
  await page.screenshot({ path: 'test-results/snapped.png' });

  // Unlock the board and drag it by an empty patch; the worker and the market go with it.
  const card = Object.values((await table(page)).objects).find(
    (o) => o.snap === 'main-board/market/0',
  )!;
  await drag(page, [0, 100], [0, 100]);
  await page.keyboard.press('l');
  // Wait for the page itself to know, not just the server: a drag on a board the page
  // still thinks is locked does nothing.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window.__trayful!.store.getState() as unknown as {
              table: { objects: Record<string, { locked?: boolean }> };
            }
          ).table.objects['main-board']?.locked,
      ),
    )
    .toBeUndefined();
  await drag(page, [0, 100], [60, 100]);
  await expect.poll(async () => (await piece(page, 'main-board')).pos[0]).toBeGreaterThan(55);
  // Screen pixels round the drag a little, so compare with how far the board really moved.
  const [dx, dy] = (await piece(page, 'main-board')).pos;
  const moved = await piece(page, 'worker.red.1');
  expect(moved.pos[0]).toBeCloseTo(-90 + dx, 6);
  expect(moved.pos[1]).toBeCloseTo(dy, 6);
  expect(moved.snap).toBe('main-board/fields/2');
  const carried = (await table(page)).objects[card.id]!;
  expect(carried.pos[0]).toBeCloseTo(card.pos[0] + dx, 6);
  expect(carried.pos[1]).toBeCloseTo(card.pos[1] + dy, 6);
  await page.screenshot({ path: 'test-results/board-moved.png' });
});

test('a pile spreads out and any card can be taken from it', async ({ page }) => {
  await openTable(page);
  const deck = (await table(page)).objects[DECK] as Stack;
  await drag(page, [deck.pos[0], deck.pos[1]], [deck.pos[0], deck.pos[1]]);
  await page.keyboard.press('v');
  await expect.poll(async () => ((await table(page)).objects[DECK] as Stack).layout).toBe('fan');
  await page.getByRole('button', { name: 'Spread' }).click();
  await expect.poll(async () => ((await table(page)).objects[DECK] as Stack).layout).toBe('spread');
  await page.screenshot({ path: 'test-results/spread.png' });

  // Cards are 63 mm wide with 3 mm gaps, so the second card from the bottom lies 66 mm left of centre.
  const second = deck.items[1]!;
  await drag(page, [deck.pos[0] - 66, deck.pos[1]], [450, 150]);
  await expect
    .poll(async () => ((await table(page)).objects[DECK] as Stack).items)
    .not.toContain(second);
  const taken = await piece(page, second);
  expect(taken.pos[0]).toBeCloseTo(450, 0);
  expect(taken.pos[1]).toBeCloseTo(150, 0);
});

test('a click on the crowded score track lists both markers to pick from', async ({ page }) => {
  await openTable(page);
  const red = await piece(page, 'score-marker.red');
  const green = await piece(page, 'score-marker.green');
  // The two markers share the first space as a group, side by side.
  expect(red.snap).toBe('main-board/score-track/0');
  expect(green.snap).toBe('main-board/score-track/0');
  expect(red.pos).not.toEqual(green.pos);

  const at = await screen(page, red.pos[0], red.pos[1]);
  await page.mouse.click(at.x, at.y);
  const picker = page.getByRole('listbox', { name: 'Pieces on main-board/score-track/0' });
  await expect(picker.getByRole('option')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/group-picker.png' });

  // Picking the one underneath selects it and brings it to the top, where it was.
  const under = red.z < green.z ? red : green;
  const over = under === red ? green : red;
  await picker.locator(`[data-id="${under.id}"]`).click();
  await expect(picker).toHaveCount(0);
  await expect
    .poll(async () => (await piece(page, under.id)).z)
    .toBeGreaterThan((await piece(page, over.id)).z);
  expect((await piece(page, under.id)).pos).toEqual(under.pos);
  expect(await page.evaluate(() => window.__trayful!.store.getState().selection)).toEqual([
    under.id,
  ]);

  // Escape closes the list without picking.
  await page.mouse.click(at.x, at.y);
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
});
