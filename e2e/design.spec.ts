import { expect, test } from '@playwright/test';
import {
  agent,
  clickOnFront,
  dragOnFront,
  libraryFile,
  newComponent,
  onFront,
  savedType,
  waitSaved,
} from './helpers.js';

const PROJECT = 'workshop';

test('a person builds a card type in the designer and deals it onto the table', async ({
  page,
  baseURL,
}) => {
  await page.goto(`/?project=${PROJECT}`);
  await page.getByRole('button', { name: 'Design' }).click();
  await expect(page.getByRole('navigation', { name: 'Component list' })).toBeVisible();

  await newComponent(page, 'Season card', 'Poker card');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector.getByText('Data fields').click();
  await inspector.getByRole('button', { name: '+ Add field' }).click();
  const fieldName = inspector.locator('.design-field').getByLabel('Name');
  await fieldName.fill('title');
  await fieldName.press('Enter');

  await inspector.getByRole('region', { name: 'Face' }).getByText('Advanced drawing').click();
  await inspector.getByRole('button', { name: 'Text', exact: true }).click();
  await inspector.getByLabel('Text', { exact: true }).fill('{{title}}');
  await waitSaved(page);

  const file = 'library/cards.yaml';
  await expect.poll(() => libraryFile(page, PROJECT, file)).toContain("text: '{{title}}'");
  const written = await libraryFile(page, PROJECT, file);
  // Written the way a person would: fields before the faces, short lists inline.
  expect(written).toContain('  - id: season-card\n    name: Season card\n');
  expect(written).toContain('size: [63, 88]');
  expect(written.indexOf('fields:')).toBeLessThan(
    written.indexOf('face:', written.indexOf('season-card')),
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

test('a person lays out a board by dragging: a layer, a grid of drop spots and a track', async ({
  page,
}) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Farm board', 'Board');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });

  // A text layer, dragged from where it starts (5, 5) and snapped to the grid.
  await inspector.getByRole('region', { name: 'Face' }).getByText('Advanced drawing').click();
  await inspector.getByRole('button', { name: 'Text', exact: true }).click();
  await dragOnFront(page, [8, 8], [101, 52]);
  await expect
    .poll(async () => (await savedType(page, 'farm-board'))?.face?.layers?.[0])
    .toMatchObject({ at: [100, 50] });

  // A grid: spot 0 moves it, the handle halfway to spot 3 sets the spacing, and the one
  // past the last spot the columns and rows.
  const snaps = inspector.getByRole('region', { name: 'Drop areas' });
  await snaps.getByRole('button', { name: 'Grid' }).click();
  await dragOnFront(page, [140, 140], [60, 60]);
  await dragOnFront(page, [70, 70], [85, 85]);
  await dragOnFront(page, [147.5, 147.5], [247.5, 147.5]);
  // A track: each click adds the next spot.
  await snaps.getByRole('button', { name: 'Points' }).click();
  await dragOnFront(page, [150, 150], [30, 270]);
  await clickOnFront(page, [60, 270]);
  await clickOnFront(page, [90, 270]);
  await waitSaved(page);

  await expect
    .poll(async () => (await savedType(page, 'farm-board'))?.container)
    .toEqual([
      { id: 'grid-1', grid: { origin: [60, 60], cols: 4, rows: 2, cell: 50 } },
      {
        id: 'points-1',
        points: [
          [30, 270],
          [60, 270],
          [90, 270],
        ],
      },
    ]);

  // One undo takes the last spot back off.
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitSaved(page);
  await expect
    .poll(async () => (await savedType(page, 'farm-board'))?.container)
    .toContainEqual({
      id: 'points-1',
      points: [
        [30, 270],
        [60, 270],
      ],
    });
});

test('renaming a type or a field changes every file that uses it', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design&type=token`);
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByLabel('Id')).toHaveValue('token');
  page.once('dialog', (dialog) => void dialog.accept('coin'));
  await inspector.getByRole('button', { name: 'Rename…' }).click();
  await expect(inspector.getByLabel('Id')).toHaveValue('coin');
  expect(await libraryFile(page, PROJECT, 'library/pieces.yaml')).toContain('- id: coin');
  expect(await libraryFile(page, PROJECT, 'inventory.yaml')).toContain('- component: coin');
  expect(await libraryFile(page, PROJECT, 'setups/start.yaml')).toContain('- place: coin');

  // A field the cards' spreadsheet fills: its column is renamed too.
  await page
    .getByRole('navigation', { name: 'Component list' })
    .getByRole('button', { name: /^Card/ })
    .click();
  await inspector.getByText('Data fields').click();
  const title = inspector.locator('.design-field').first().getByLabel('Name');
  await expect(title).toHaveValue('title');
  await title.fill('heading');
  await title.press('Enter');
  await expect(inspector.locator('.design-field').first().getByLabel('Name')).toHaveValue(
    'heading',
  );
  // The name box shows what was typed straight away; the files change once the server is done.
  await expect
    .poll(() => libraryFile(page, PROJECT, 'data/cards.csv'))
    .toMatch(/^heading,text,value,count/);
  expect(await libraryFile(page, PROJECT, 'library/cards.yaml')).toContain('field: heading');
});

test('an image dropped on a face is saved with the project and covers it', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design&type=card`);
  await expect(page.getByRole('complementary', { name: 'Inspector' }).getByLabel('Id')).toHaveValue(
    'card',
  );
  const at = await onFront(page, [30, 40]);
  // A one-pixel PNG, dropped as a file from the desktop would be.
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const drop = await page.evaluateHandle((png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'Moon Art.png', { type: 'image/png' }));
    return transfer;
  }, png);
  await page
    .getByTestId('design-canvas')
    .dispatchEvent('drop', { dataTransfer: drop, clientX: at.x, clientY: at.y });
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'card'))?.face?.image).toBe('moon-art');
  expect(await libraryFile(page, PROJECT, 'assets/moon-art.png')).toBeTruthy();
  expect(await libraryFile(page, PROJECT, 'assets.yaml')).toContain(
    'moon-art: assets/moon-art.png',
  );
});
