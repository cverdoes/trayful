import { expect, test, type Page } from '@playwright/test';
import type { Stack } from '@trayful/core';
import { agent, DECK, freshTable, openTable, screen, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!));

/** Drags on the page between two points of the same surface, in millimetres. */
async function dragOn(page: Page, surface: string, from: [number, number], to: [number, number]) {
  const a = await screen(page, ...from, surface);
  const b = await screen(page, ...to, surface);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test('surfaces show as tiles a viewer switches on and off', async ({ page, baseURL }) => {
  await openTable(page);
  // A table without surfaces has no chips, and one canvas fills the window.
  await expect(page.getByRole('navigation', { name: 'Surfaces' })).toHaveCount(0);

  const { call, client } = await agent(baseURL!);
  await call('add_surface', { id: 'side', name: 'Side table' });
  await call('move', { ids: ['worker.red.1'], to: 'surface:side' });

  const chips = page.getByRole('navigation', { name: 'Surfaces' });
  await expect(chips.getByRole('button', { name: 'Centre' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(chips.getByRole('button', { name: 'Side table' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-surface]')).toHaveCount(2);
  await expect(page.locator('[data-surface=side]')).toContainText('Side table');
  await page.screenshot({ path: 'test-results/surfaces-tiles.png' });

  // A piece dragged on the side tile stays on that surface.
  const worker = (await table(page)).objects['worker.red.1']!;
  await dragOn(page, 'side', worker.pos, [worker.pos[0] + 30, worker.pos[1]]);
  await expect
    .poll(async () => (await table(page)).objects['worker.red.1']!.pos[0])
    .toBe(worker.pos[0] + 30);
  expect((await table(page)).objects['worker.red.1']!.surface).toBe('side');

  // Switching the side off leaves the Centre alone; a change there makes its chip pulse.
  const side = chips.getByRole('button', { name: 'Side table' });
  await side.click();
  await expect(side).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-surface]')).toHaveCount(1);
  await call('move', { ids: ['worker.red.1'], by: [10, 0] });
  await expect(side).toHaveClass(/pulse/);

  // The choice is kept in this browser for this table.
  await page.reload();
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(chips.getByRole('button', { name: 'Side table' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await chips.getByLabel('View').selectOption('all');
  await expect(page.locator('[data-surface]')).toHaveCount(2);

  // A number key shows one tile on its own until Escape.
  await page.keyboard.press('2');
  await expect(page.locator('[data-surface]')).toHaveCount(1);
  await expect(page.locator('[data-surface=side]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-surface]')).toHaveCount(2);
  await client.close();
});

test('a card played from the hand lands on the tile it is dropped on', async ({
  page,
  baseURL,
}) => {
  await openTable(page);
  const { call, client } = await agent(baseURL!);
  await call('add_surface', { id: 'side', name: 'Side table' });
  const deck = (await table(page)).objects[DECK] as Stack;
  const me = await page.evaluate(
    () =>
      (window.__trayful!.store.getState() as unknown as { me: { player: { id: string } } }).me
        .player.id,
  );
  await call('draw', { from: deck.id, to: `hand:${me}` });
  await expect(page.locator('.hand-card')).toHaveCount(1);

  const card = (await page.locator('.hand-card').getAttribute('data-id'))!;
  const tile = (await page.locator('[data-surface=side]').boundingBox())!;
  const at = await screen(page, 0, 0, 'side');
  await page.locator('.hand-card').dragTo(page.locator('[data-surface=side]'), {
    targetPosition: { x: at.x - tile.x, y: at.y - tile.y },
  });
  await expect(page.locator('.hand-card')).toHaveCount(0);
  const played = (await table(page)).objects[card]!;
  expect(played.surface).toBe('side');
  expect(played.pos[0]).toBeCloseTo(0, 0);
  await client.close();
});
