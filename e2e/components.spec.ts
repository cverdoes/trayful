import { expect, test } from '@playwright/test';
import {
  addDropArea,
  addImage,
  libraryFile,
  newComponent,
  savedType,
  waitSaved,
} from './helpers.js';

const PROJECT = 'workshop';

test('a card, a hex tile, a die and a counter are made without touching YAML', async ({ page }) => {
  // Images first: a strip of die faces and a sheet of hexes, each cut into tiles.
  await page.goto(`/?project=${PROJECT}&design&assets`);
  await addImage(page, 'Die faces.png', [1, 6]);
  await addImage(page, 'Hexes.png', [2, 2]);
  await expect
    .poll(() => libraryFile(page, PROJECT, 'assets.yaml'))
    .toContain('die-faces: { file: assets/die-faces.png, cols: 6 }');

  await page.getByRole('button', { name: 'Components' }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  const face = inspector.getByRole('region', { name: 'Face' });

  // A card with a label on its face.
  await newComponent(page, 'Storm card', 'Poker card');
  await face.getByRole('button', { name: 'Add label' }).click();
  await inspector.getByLabel('Text', { exact: true }).fill('Storm');
  await waitSaved(page);
  await expect
    .poll(async () => JSON.stringify((await savedType(page, 'storm-card'))?.face))
    .toContain('Storm');

  // A hex tile, each showing the tile of the sheet the inventory gives it.
  await newComponent(page, 'Land', 'Hex tile');
  await face.getByLabel('Image').selectOption('hexes');
  await face.getByLabel('Shows').selectOption({ label: 'Each component picks its tile' });
  await waitSaved(page);
  await expect
    .poll(async () => (await savedType(page, 'land'))?.face?.image)
    .toEqual({ asset: 'hexes', tile: 'instance' });

  // A die showing the tile of the strip that matches its value.
  await newComponent(page, 'Weather die', 'Six-sided die');
  await face.getByLabel('Image').selectOption('die-faces');
  await expect(face.getByLabel('Shows')).toHaveValue('value');
  await waitSaved(page);
  await expect
    .poll(async () => (await savedType(page, 'weather-die'))?.face?.image)
    .toEqual({ asset: 'die-faces', tile: 'value' });

  // A counter from 0 to 20.
  await newComponent(page, 'Score', 'Counter');
  const values = inspector.getByRole('region', { name: 'Values' });
  await values.getByRole('textbox', { name: 'max' }).fill('20');
  await values.getByRole('textbox', { name: 'max' }).press('Enter');
  await waitSaved(page);
  await expect
    .poll(async () => savedType(page, 'score'))
    .toMatchObject({ is: 'counter', values: { range: [0, 20] } });
});

test('what a component stacks with is picked from the other components', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Penny', 'Round token');
  const behaviour = page.getByRole('region', { name: 'Behaviour' });
  await behaviour.getByLabel('Stackable').check();
  const partners = behaviour.getByLabel('Stacks with');
  // A few letters of a name are enough when only one component starts so.
  await partners.fill('tok');
  await partners.press('Enter');
  await partners.fill('Card');
  await partners.press('Enter');
  await expect(behaviour.locator('.picker-chip')).toHaveText(['Token', 'Card']);
  await waitSaved(page);
  await expect
    .poll(async () => (await savedType(page, 'penny'))?.stackable)
    .toEqual({ with: ['token', 'card'] });

  await behaviour.getByRole('button', { name: 'Remove Token' }).click();
  await waitSaved(page);
  await expect
    .poll(async () => (await savedType(page, 'penny'))?.stackable)
    .toEqual({ with: ['card'] });
});

test('inspector sections fold away and stay folded from one component to the next', async ({
  page,
}) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Pebble', 'Round token');
  const face = page.getByRole('region', { name: 'Face' });
  await expect(face.getByLabel('Fill')).toBeVisible();
  // Folded from the keyboard as well as by a click.
  await face.locator('summary').first().focus();
  await page.keyboard.press('Enter');
  await expect(face.getByLabel('Fill')).toBeHidden();

  await newComponent(page, 'Shell', 'Round token');
  await expect(face.getByLabel('Fill')).toBeHidden();
  await face.getByText('Face', { exact: true }).click();
  await expect(face.getByLabel('Fill')).toBeVisible();
});

test('a component changes kind through a dialog, and a drop area is removed from its list', async ({
  page,
}) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Garden', 'Board');
  await addDropArea(page, 'Area');
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'garden'))?.container).toBeTruthy();

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await inspector
    .getByRole('region', { name: 'Drop areas' })
    .getByRole('button', { name: /^Remove / })
    .click();
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'garden'))?.container).toBeUndefined();

  await inspector.getByRole('button', { name: 'Change kind' }).click();
  await page
    .getByRole('dialog', { name: 'Change what "Garden" is' })
    .getByRole('button', { name: /^Zone\b/ })
    .click();
  await expect(inspector.getByRole('region', { name: 'Basics' })).toContainText('Zone');
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'garden'))?.is).toBe('zone');
});

test('a colour is picked from the project colours, or typed in', async ({ page }) => {
  await page.goto(`/?project=${PROJECT}&design`);
  await newComponent(page, 'Tile', 'Square tile');
  const face = page.getByRole('complementary', { name: 'Inspector' }).getByRole('region', {
    name: 'Face',
  });

  await face.getByRole('button', { name: 'Fill' }).click();
  const picker = page.getByRole('dialog', { name: 'Pick a colour' });
  await picker.getByRole('button', { name: 'orange' }).click();
  await expect(picker).toBeHidden();
  await expect(face.getByRole('button', { name: 'Fill' })).toContainText('orange');
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'tile'))?.face?.fill).toBe('orange');

  await face.getByRole('button', { name: 'Fill' }).click();
  await picker.getByLabel('Colour value').fill('#123456');
  await picker.getByLabel('Colour value').press('Enter');
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await waitSaved(page);
  await expect.poll(async () => (await savedType(page, 'tile'))?.face?.fill).toBe('#123456');
});
