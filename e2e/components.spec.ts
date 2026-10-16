import { expect, test } from '@playwright/test';
import { addImage, libraryFile, newComponent, savedType, waitSaved } from './helpers.js';

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
  await face.getByRole('button', { name: 'Label', exact: true }).click();
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
  await expect(behaviour.locator('.picker-chip')).toHaveText(['Token×', 'Card×']);
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
