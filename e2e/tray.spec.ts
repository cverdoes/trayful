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

test('a CSV file is edited like a spreadsheet', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design&tray&type=card`);
  const grid = page.getByRole('main', { name: 'Tray' }).getByRole('region', { name: 'Entry 1' });
  const cell = (name: string) => grid.getByLabel(name, { exact: true });

  // The keys move from cell to cell, and typing replaces the text of the cell arrived in.
  await cell('text, row 1').click();
  await page.keyboard.press('ArrowDown');
  await expect(cell('text, row 2')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell('value, row 2')).toBeFocused();
  await page.keyboard.press('Shift+Enter');
  await expect(cell('value, row 1')).toBeFocused();
  await page.keyboard.type('7');
  await expect(cell('value, row 1')).toHaveValue('7');

  // Cells copied from a spreadsheet fill the grid from the cell they are pasted in.
  const last = await grid.getByRole('rowheader').count();
  const first = await cell('Name of column 1').inputValue();
  await cell(`${first}, row ${last}`).evaluate((box) => {
    const copied = new DataTransfer();
    copied.setData('text/plain', 'Rest\tRest a turn.\t0\t1\nFeast\tEat well.\t5\t1\n');
    box.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: copied, bubbles: true, cancelable: true }),
    );
  });
  await expect(cell(`text, row ${last + 1}`)).toHaveValue('Eat well.');
  await expect(cell(`value, row ${last}`)).toHaveValue('0');
  await waitSaved(page);
  await expect
    .poll(() => libraryFile(page, PROJECT, 'data/cards.csv'))
    .toContain('Feast,Eat well.,5,1');

  // The paste is one step to undo, apart from what was typed before it.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(grid.getByRole('rowheader')).toHaveCount(last);
  await expect(cell('value, row 1')).toHaveValue('7');
});

test('designs in rows share the grid, and a field with choices is a drop-down', async ({
  page,
}) => {
  await page.goto('/?project=harvest-moon&design&tray&type=action-card');
  const tray = page.getByRole('main', { name: 'Tray' });
  const rows = tray.getByRole('region', { name: 'Entry 1' });
  const cell = (name: string) => rows.getByLabel(name, { exact: true });

  // The keys move between the designs' cells; the field names above them are not cells.
  await cell('name, row 2').click();
  await page.keyboard.press('ArrowUp');
  await expect(cell('name, row 1')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cell('text, row 1')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(cell('text, row 1')).toBeFocused();

  // A CSV file's column for a field with choices picks from them too.
  const suit = tray.getByRole('region', { name: 'Entry 2' }).getByLabel('suit, row 1');
  await expect(suit).toHaveValue('green');
  await suit.selectOption('red');
  await waitSaved(page);
  await expect
    .poll(() => libraryFile(page, 'harvest-moon', 'data/actions.csv'))
    .toContain('Plough,1,red,');
  await tray.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect(suit).toHaveValue('green');
});
