import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { agent } from './helpers.js';

const PROJECT = 'workshop';

async function libraryFile(page: Page, file: string): Promise<string> {
  const health = (await (await page.request.get('/api/health')).json()) as { root: string };
  return readFile(path.join(health.root, PROJECT, file), 'utf8');
}

async function waitSaved(page: Page) {
  await expect(page.getByRole('status')).toContainText('Saved to');
}

test('a person builds a card type in the designer and deals it onto the table', async ({
  page,
  baseURL,
}) => {
  await page.goto(`/?project=${PROJECT}`);
  await page.getByRole('button', { name: 'Design' }).click();
  await expect(page.getByRole('navigation', { name: 'Types' })).toBeVisible();

  await page.getByRole('button', { name: '+ New type' }).click();
  const dialog = page.getByRole('dialog', { name: 'New type' });
  await dialog.getByRole('textbox').fill('Season card');
  await dialog.getByLabel('Poker card').check();
  await dialog.getByRole('button', { name: 'Create' }).click();
  await waitSaved(page);

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByRole('button', { name: '+ Add field' }).click();
  const fieldName = inspector.locator('.design-field').getByLabel('Name');
  await fieldName.fill('title');
  await fieldName.press('Enter');

  await inspector.getByRole('button', { name: 'Text', exact: true }).click();
  await inspector.getByLabel('Text', { exact: true }).fill('{{title}}');
  await waitSaved(page);

  const file = 'library/cards.yaml';
  await expect.poll(() => libraryFile(page, file)).toContain("text: '{{title}}'");
  const written = await libraryFile(page, file);
  // Written the way a person would: fields before the faces, short lists inline.
  expect(written).toContain('  - id: season-card\n    base: card\n    name: Season card\n');
  expect(written).toContain('size: [63, 88]');
  expect(written.indexOf('fields:')).toBeLessThan(
    written.indexOf('front:', written.indexOf('season-card')),
  );

  // The YAML pane shows the same type.
  await page.getByRole('button', { name: 'Show YAML' }).click();
  await expect(page.getByLabel('YAML')).toContainText('title: string');

  // Components of the new type appear on the table.
  const claude = await agent(baseURL!);
  await claude.call('open_table', { project: PROJECT, table: 'table-1' });
  await claude.call('set_inventory', {
    type: 'season-card',
    entries: [{ deck: 'seasons', items: [{ title: 'Thaw' }, { title: 'Frost' }] }],
  });
  // The other tests play on the example's table.
  await claude.call('open_table', { project: 'harvest-moon', table: 'table-1' });
  await claude.client.close();
  await page.getByRole('button', { name: 'Table' }).click();
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(
          (window.__trayful!.store.getState() as unknown as { table: { objects: object } }).table
            .objects,
        ),
      ),
    )
    .toContain('deck:seasons');
});
