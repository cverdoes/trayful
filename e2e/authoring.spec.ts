import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { agent } from './helpers.js';

const PROJECT = 'workshop';

async function projectDir(page: Page): Promise<string> {
  const health = (await (await page.request.get('/api/health')).json()) as { root: string };
  return path.join(health.root, PROJECT);
}

async function openWorkshop(page: Page, table = 'table-1') {
  await page.goto(`/?project=${PROJECT}&table=${table}`);
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
}

/** Ids of the objects the browser shows. */
function objectIds(page: Page) {
  return page.evaluate(() =>
    Object.keys(
      (window.__trayful!.store.getState() as unknown as { table: { objects: object } }).table
        .objects,
    ),
  );
}

test('an agent designs a card type while a person watches it appear', async ({ page, baseURL }) => {
  const claude = await agent(baseURL!);
  await claude.call('open_table', { project: PROJECT, table: 'design' });
  await openWorkshop(page, 'design');

  await claude.call('upsert_type', {
    definition: {
      id: 'event-card',
      base: 'card',
      name: 'Event',
      size: [88, 63],
      corner: 3,
      fields: {
        title: 'string',
        season: { enum: ['spring', 'summer', 'autumn', 'winter'] },
        band: { enum: ['yellowgreen', 'gold', 'darkorange', 'lightsteelblue'] },
      },
      front: {
        fill: 'paper',
        stroke: 'ink',
        layers: [
          { shape: 'rect', at: [0, 0], size: [88, 12], fill: '{{band}}' },
          { text: '{{title}}', at: [5, 3], font: { size: 16, weight: 'bold' }, color: 'ink' },
          {
            text: '{{season}}',
            at: [83, 58],
            align: 'right',
            valign: 'bottom',
            font: { size: 10 },
            color: 'ink',
          },
        ],
      },
      back: { fill: 'ink', layers: [{ image: 'assets/card-back.svg' }] },
    },
  });
  await claude.call('set_inventory', {
    type: 'event-card',
    entries: [
      {
        deck: 'events',
        items: [
          { title: 'Thaw', season: 'spring', band: 'yellowgreen' },
          { title: 'Drought', season: 'summer', band: 'gold', count: 2 },
          { title: 'Harvest fair', season: 'autumn', band: 'darkorange' },
          { title: 'Frost', season: 'winter', band: 'lightsteelblue', count: 2 },
        ],
      },
    ],
  });

  // The new deck shows up on the open table without a reload.
  await expect.poll(() => objectIds(page)).toContain('deck:events');

  // The agent looks at its card the way people will see it.
  const picture = await claude.call('render_component', {
    type: 'event-card',
    data: { title: 'Drought', season: 'summer', band: 'gold' },
  });
  const png = Buffer.from(picture.content[0]!.data!, 'base64');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  await writeFile('test-results/render-component.png', png);

  // A change that would break the project is refused and leaves the files alone.
  await expect(
    claude.call('upsert_type', { definition: { id: 'event-card', base: 'card', size: [88, 63] } }),
  ).rejects.toThrow(/would break the project/);

  await page.keyboard.press('0');
  await page.screenshot({ path: 'test-results/agent-designed-deck.png' });
  await claude.call('open_table', { project: 'harvest-moon', table: 'table-1' });
  await claude.client.close();
});

test('saving a file updates the open table, and a broken file is reported', async ({ page }) => {
  await openWorkshop(page);
  const dir = await projectDir(page);
  const csv = path.join(dir, 'data', 'cards.csv');
  const original = await readFile(csv, 'utf8');

  await writeFile(csv, original + 'Rest,Skip your next turn.,0,1\n');
  await expect.poll(() => objectIds(page)).toContain('card.rest');

  await writeFile(csv, original + 'Rest,Skip your next turn.,zero,1\n');
  await expect(page.getByRole('alert')).toContainText('"value" must be a number');

  await writeFile(csv, original);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => objectIds(page)).not.toContain('card.rest');
});

test('the table menu switches projects and makes new tables', async ({ page }) => {
  await openWorkshop(page);
  const menu = page.getByRole('combobox', { name: 'Table' });
  await expect(menu.locator('optgroup[label="Harvest Moon"] option')).not.toHaveCount(0);

  page.once('dialog', (dialog) => void dialog.accept('second'));
  await menu.selectOption({ label: 'New table…' });
  await page.waitForURL(/table=second/);
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(menu).toHaveValue(`${PROJECT}/second`);

  page.once('dialog', (dialog) => void dialog.accept());
  await menu.selectOption({ label: 'Delete this table…' });
  await page.waitForURL((url) => !url.search.includes('second'));
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(menu.locator(`option[value="${PROJECT}/second"]`)).toHaveCount(0);

  await menu.selectOption('harvest-moon/table-1');
  await page.waitForURL(/project=harvest-moon/);
});

test('print and play lays every component out at real size', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&print`);
  const sheets = page.locator('.sheet');
  await expect(sheets.first()).toBeVisible();
  // Cards and tokens are two-sided, so their backs follow on sheets of their own.
  await expect(page.locator('.sheet[data-face="down"]')).not.toHaveCount(0);
  const card = page.locator('.sheet-item[title="card.score"]').first();
  const box = (await card.boundingBox())!;
  // 63 mm at 96 dpi.
  expect(box.width).toBeCloseTo((63 / 25.4) * 96, 0);
  await page.screenshot({ path: 'test-results/print-sheets.png', fullPage: true });
});
