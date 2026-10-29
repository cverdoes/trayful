import { expect, test, type Page } from '@playwright/test';
import type { Piece } from '@trayful/core';
import { screen, table } from './helpers.js';

const PROJECT = 'roll-and-write';

/** Where a point on sheet.1, in millimetres from its top-left corner, is on the screen. */
async function onSheet(page: Page, x: number, y: number) {
  // The setup puts sheet.1, 140 × 100 mm, with its centre at [0, 0].
  return screen(page, x - 70, y - 50);
}

async function marks(page: Page) {
  return ((await table(page, PROJECT)).objects['sheet.1'] as Piece).marks;
}

test('a person stamps boxes, writes in one and erases one', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}`);
  // The table is drawn and fitted to the window once its state has arrived.
  await page.waitForFunction(() => {
    const state = window.__trayful?.store.getState() as
      { table?: { objects: Record<string, unknown> }; viewport: { scale: number } } | undefined;
    return state?.table?.objects['sheet.1'] !== undefined && state.viewport.scale !== 1;
  });

  // The first row's second box takes a ring or a cross, so clicking it asks which.
  const box = await onSheet(page, 40, 25);
  await expect(async () => {
    await page.mouse.click(box.x, box.y);
    await expect(page.getByRole('option', { name: 'Cross' })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.getByRole('option', { name: 'Cross' }).click();
  await expect.poll(() => marks(page)).toEqual({ 'boxes/1': { stamp: 'cross' } });

  const score = await onSheet(page, 100, 25);
  await page.mouse.click(score.x, score.y);
  await page.getByLabel('Text', { exact: true }).fill('12');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => marks(page))
    .toEqual({ 'boxes/1': { stamp: 'cross' }, 'score/0': { text: '12' } });

  await page.mouse.click(box.x, box.y, { button: 'right' });
  await expect.poll(() => marks(page)).toEqual({ 'score/0': { text: '12' } });

  // Emptying a text box erases it, which leaves the sheet blank for the next run.
  await page.mouse.click(score.x, score.y);
  await page.getByLabel('Text', { exact: true }).fill('');
  await page.keyboard.press('Enter');
  await expect.poll(() => marks(page)).toBeUndefined();
});
