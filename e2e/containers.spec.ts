import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Piece } from '@trayful/core';
import {
  agent,
  clickOnFront,
  dragOnFront,
  inviteGuest,
  newComponent,
  savedType,
  screen,
  table,
  waitSaved,
  type Point,
} from './helpers.js';

const PROJECT = 'workshop';

/** Adds a drop area and gives it an id and what it accepts. */
async function addArea(inspector: Locator, kind: string, id: string, accepts?: string) {
  await inspector
    .getByRole('region', { name: 'Drop areas' })
    .getByRole('button', { name: kind, exact: true })
    .click();
  const editor = inspector.getByLabel('Selected drop area');
  await editor.getByLabel('Id', { exact: true }).fill(id);
  if (accepts) await editor.getByLabel('Accepts').fill(accepts);
  return editor;
}

/** Fills a pair of numbers: the row's first box and the box after it. */
async function fillPair(editor: Locator, label: string, [a, b]: Point) {
  const first = editor.getByLabel(label, { exact: true });
  await first.fill(String(a));
  await first.locator('xpath=following-sibling::input[1]').fill(String(b));
}

// The Harvest Moon board's drop areas, accepting the workshop's own cards and tokens.
test('a person rebuilds the Harvest Moon board in the designer', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Harvest board', 'Board');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await fillPair(inspector, 'Size (mm)', [600, 400]);

  const market = await addArea(inspector, 'Grid', 'market', 'card');
  await fillPair(market, 'First spot (mm)', [85, 70]);
  await market.getByLabel('Columns').fill('5');
  await market.getByLabel('Rows').fill('1');
  await fillPair(market, 'Spacing (mm)', [70, 95]);

  const fields = await addArea(inspector, 'Grid', 'fields', 'token');
  await fillPair(fields, 'First spot (mm)', [110, 200]);
  await fields.getByLabel('Columns').fill('4');
  await fillPair(fields, 'Spacing (mm)', [50, 50]);

  // Started as a bag, then switched back to holding things where they are dropped.
  const supply = await addArea(inspector, 'Bag', 'supply');
  await expect(supply.getByLabel('Holds')).toHaveValue('bag');
  await supply.getByLabel('Holds').selectOption({ label: 'Things where they are dropped' });
  await fillPair(supply, 'Top-left (mm)', [440, 180]);
  await fillPair(supply, 'Size (mm)', [140, 140]);

  // The score track: its first spot is dragged into place, and each click adds the next.
  const track = await addArea(inspector, 'Points', 'score-track', 'token');
  await expect(track.getByLabel('Holds')).toHaveValue('');
  await dragOnFront(page, [300, 200], [30, 370]);
  for (let i = 1; i <= 10; i++) await clickOnFront(page, [30 + 50 * i, 370]);
  await waitSaved(page);

  await expect
    .poll(async () => (await savedType(page, 'harvest-board'))?.container)
    .toEqual([
      {
        id: 'market',
        accepts: ['card'],
        grid: { origin: [85, 70], cols: 5, rows: 1, cell: [70, 95] },
      },
      {
        id: 'fields',
        accepts: ['token'],
        grid: { origin: [110, 200], cols: 4, rows: 2, cell: 50 },
      },
      { id: 'supply', area: { at: [440, 180], size: 140 } },
      {
        id: 'score-track',
        accepts: ['token'],
        points: Array.from({ length: 11 }, (_, i) => [30 + 50 * i, 370]),
      },
    ]);
});

/** How many pieces each bag holds, and the ids of the cubes the page was sent. */
function seen(page: Page) {
  return page.evaluate(() => {
    const { table } = window.__trayful!.store.getState() as unknown as {
      table: { bags: Record<string, number>; objects: Record<string, { type?: string }> };
    };
    const cubes = Object.entries(table.objects).filter(([, o]) => o.type === 'cube');
    return { bags: table.bags, cubes: cubes.length };
  });
}

test('two players draw from a bag, and nobody sees inside it', async ({
  page,
  browser,
  baseURL,
}) => {
  const claude = await agent(baseURL!);
  await claude.call('open_table', { project: PROJECT, table: 'bags', setup: false });
  await page.goto(`/?project=${PROJECT}&table=bags`);
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await claude.call('upsert_type', {
    definition: {
      id: 'sack',
      size: 40,
      is: 'piece',
      face: { shape: 'circle', fill: '#9a7b4f' },
      container: [{ id: 'bag', area: { at: [0, 0], size: 40 }, mode: 'bag' }],
    },
  });
  await claude.call('upsert_type', {
    definition: { id: 'cube', size: 10, is: 'piece', stackable: true, face: { fill: 'red' } },
  });
  await claude.call('set_inventory', { type: 'sack', entries: [{ count: 1 }] });
  await claude.call('set_inventory', { type: 'cube', entries: [{ count: 4 }] });
  const objects = Object.values((await table(page, PROJECT, 'bags')).objects);
  const sack = objects.find((o): o is Piece => o.kind === 'piece' && o.type === 'sack')!;
  const cubes = objects.filter((o) => o.kind === 'piece' && o.type === 'cube').map((o) => o.id);
  expect(cubes).toHaveLength(4);
  await claude.call('move', { ids: [sack.id], to: [0, 0] });
  await claude.call('move', { ids: cubes, to: `${sack.id}/bag` });
  const { context, guest } = await inviteGuest(page, browser, 'Ann');
  const bag = `${sack.id}/bag`;
  for (const viewer of [page, guest])
    await expect.poll(() => seen(viewer)).toEqual({ bags: { [bag]: 4 }, cubes: 0 });

  // The host clicks the count on the bag; Ann picks the bag and draws.
  const badge = await screen(page, 20, -20);
  await page.mouse.click(badge.x, badge.y);
  await expect(page.locator('.hand-card')).toHaveCount(1);
  const middle = await screen(guest, 0, 0);
  await guest.mouse.click(middle.x, middle.y);
  await guest.keyboard.press('d');
  await expect(guest.locator('.hand-card')).toHaveCount(1);

  // Each holds one cube that only they see; the bag holds two for everyone.
  for (const viewer of [page, guest])
    await expect.poll(() => seen(viewer)).toEqual({ bags: { [bag]: 2 }, cubes: 1 });
  const mine = await page.locator('.hand-card').getAttribute('data-id');
  const bobs = await guest.locator('.hand-card').getAttribute('data-id');
  expect(mine).not.toEqual(bobs);
  await expect(guest.locator('.activity')).toContainText('drew 1 piece from a bag');

  await context.close();
  await claude.call('open_table', { project: 'harvest-moon', table: 'table-1' });
  await claude.client.close();
});
