import { expect, test } from '@playwright/test';
import type { Stack } from '@trayful/core';
import { addImage, agent, libraryFile, newComponent, table, waitSaved } from './helpers.js';

const PROJECT = 'workshop';

test('a sheet of 24 terrain tiles becomes a deck in a few clicks', async ({ page, baseURL }) => {
  await page.goto(`/?project=${PROJECT}&design&assets`);
  await addImage(page, 'Terrain.png', [4, 6]);

  await page.getByRole('button', { name: 'Components' }).click();
  await newComponent(page, 'Terrain', 'Hex tile');
  const face = page.getByRole('region', { name: 'Face' });
  await face.getByLabel('Image').selectOption('terrain');
  await face.getByLabel('Shows').selectOption({ label: 'Each component picks its tile' });
  await waitSaved(page);

  await page.getByRole('button', { name: 'Tray' }).click();
  const tray = page.getByRole('main', { name: 'Tray' });
  await tray.getByRole('button', { name: 'One of every tile' }).click();
  await waitSaved(page);
  await expect(tray).toContainText('24 designs');
  await expect(tray).toContainText('24 in the box now');
  await expect
    .poll(() => libraryFile(page, PROJECT, 'inventory.yaml'))
    .toContain('  - component: terrain\n    deck: terrain\n');

  // Two more of one tile, picked from the sheet.
  await tray.getByRole('button', { name: 'Designs in rows' }).click();
  const rows = tray.getByRole('region', { name: 'Entry 2' });
  await rows.getByLabel('tile, row 1', { exact: true }).click();
  await rows.getByRole('button', { name: 'Tile 5' }).click();
  await rows.getByLabel('copies, row 1', { exact: true }).fill('2');
  await waitSaved(page);
  await expect(tray).toContainText('26 in the box now');
  await page.screenshot({ path: 'test-results/tray.png' });

  // On a new table the 24 tiles lie in one deck.
  const claude = await agent(baseURL!);
  await claude.call('open_table', { project: PROJECT, table: 'tray' });
  const deck = (await table(page, PROJECT, 'tray')).objects['deck:terrain'] as Stack;
  expect(deck.items).toHaveLength(24);
  await claude.call('open_table', { project: 'harvest-moon', table: 'table-1' });
  await claude.client.close();

  // Renaming the sheet changes the component that shows it.
  await page.getByRole('button', { name: 'Assets' }).click();
  page.once('dialog', (dialog) => void dialog.accept('landscape'));
  await page
    .getByRole('listitem', { name: 'terrain' })
    .getByRole('button', { name: 'Rename' })
    .click();
  await expect(page.getByRole('listitem', { name: 'landscape' })).toBeVisible();
  await page.getByRole('button', { name: 'Components' }).click();
  await expect(face.getByLabel('Image')).toHaveValue('landscape');
  await page.getByRole('button', { name: 'Tray' }).click();
  await expect(tray).toContainText('26 in the box now');
});

test("a CSV file's rows are edited in the Tray", async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design&tray&type=card`);
  const tray = page.getByRole('main', { name: 'Tray' });
  await expect(tray).toContainText('data/cards.csv');
  // The design spec renames the title field, so edit the text, which keeps its name.
  await tray.getByLabel('text, row 1', { exact: true }).fill('Wander off.');
  await waitSaved(page);
  await expect
    .poll(() => libraryFile(page, PROJECT, 'data/cards.csv'))
    .toMatch(/^\w+,text,value,count\n\w+,Wander off\.,/);

  // A column named after no field is refused, and undone.
  await tray.getByLabel('Name of column 3', { exact: true }).fill('worth');
  await expect(page.getByRole('status')).toContainText('"worth" is not a field of "card"');
  await tray.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect(tray.getByLabel('Name of column 3', { exact: true })).toHaveValue('value');
  await tray.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect
    .poll(() => libraryFile(page, PROJECT, 'data/cards.csv'))
    .not.toContain('Wander off.');
  await tray.getByRole('button', { name: 'Redo' }).click();
  await expect(tray.getByLabel('text, row 1', { exact: true })).toHaveValue('Wander off.');

  // Another file of cards, added from the computer, with the same first column.
  const [name] = (await libraryFile(page, PROJECT, 'data/cards.csv')).split(',');
  await tray.locator('input[type=file]').setInputFiles({
    name: 'More cards.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${name},value\nRest,1\nFeast,2\n`),
  });
  await expect(tray).toContainText('data/more-cards.csv');
  await waitSaved(page);
  await expect(tray.getByLabel(`${name}, row 2`, { exact: true }).last()).toHaveValue('Feast');
});
