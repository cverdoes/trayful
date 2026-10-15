import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthoringError } from './authoring.js';
import { renameField, renameType } from './renaming.js';
import { Workspace } from './workspace.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let workspace: Workspace;
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-rename-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  workspace = await Workspace.open(dir, { seed: 1, watch: false });
});

afterEach(() => workspace.close());

const projectId = () => workspace.active.projectId;
const read = (file: string) => readFile(path.join(dir, file), 'utf8');
const componentsOf = (type: string) =>
  workspace.project().components.filter((c) => c.type === type);

describe('renaming a type', () => {
  it('renames it in the library, the inventory and the setups, and nowhere else', async () => {
    const cards = await read('library/cards.yaml');
    const pieces = await read('library/pieces.yaml');
    const result = await renameType(workspace, projectId(), 'worker', 'farmer');

    expect(result).toEqual({
      id: 'farmer',
      files: ['library/pieces.yaml', 'inventory.yaml', 'setups/2-player.yaml'],
    });
    expect(await read('library/pieces.yaml')).toBe(
      pieces.replace('accepts: [worker]', 'accepts: [farmer]').replace('id: worker', 'id: farmer'),
    );
    expect(await read('library/cards.yaml')).toBe(cards);
    expect(await read('inventory.yaml')).toContain('  - type: farmer\n');
    expect(await read('setups/2-player.yaml')).toContain('  - place: farmer\n');
    expect(workspace.project().types.worker).toBeUndefined();
    expect(componentsOf('farmer').map((c) => c.id)).toContain('farmer.red.1');
    expect(componentsOf('worker')).toEqual([]);
  });

  it('renames the component ids and snap targets setups refer to', async () => {
    await renameType(workspace, projectId(), 'score-marker', 'marker');
    expect(await read('library/pieces.yaml')).toContain('accepts: [marker]');
    const setup = await read('setups/2-player.yaml');
    expect(setup).toContain('place: marker.red\n');
    expect(setup).toContain('place: marker.green\n');

    await renameType(workspace, projectId(), 'main-board', 'farm');
    const renamed = await read('setups/2-player.yaml');
    expect(renamed).toContain('at: farm/score-track/0');
    expect(renamed).toContain('to: farm/market,');
    expect(renamed).toContain('place: farm\n');
  });

  it('renames snap targets named by a component id, as setups must with two boards', async () => {
    const inventory = await read('inventory.yaml');
    await writeFile(
      path.join(dir, 'inventory.yaml'),
      inventory.replace('  - type: main-board', '  - type: main-board\n    count: 2'),
    );
    const setup = (await read('setups/2-player.yaml'))
      .replaceAll('main-board/', 'main-board.1/')
      .replace('place: main-board\n', 'place: main-board.1\n');
    await writeFile(path.join(dir, 'setups/2-player.yaml'), setup);
    await workspace.reload(projectId());

    await renameType(workspace, projectId(), 'main-board', 'farm');
    const renamed = await read('setups/2-player.yaml');
    expect(renamed).toContain('at: farm.1/score-track/0');
    expect(renamed).toContain('place: farm.1\n');
    expect(renamed).not.toContain('main-board');
  });

  it('refuses ids that are taken, invalid or unknown', async () => {
    const rename = (from: string, to: string) => renameType(workspace, projectId(), from, to);
    await expect(rename('worker', 'd6')).rejects.toThrow(
      'There is already a type "d6"; pick another id.',
    );
    await expect(rename('worker', 'Farmer Joe')).rejects.toThrow(
      /"Farmer Joe" is not a valid type id\. Use lowercase letters/,
    );
    await expect(rename('lantern', 'lamp')).rejects.toThrow(AuthoringError);
    expect(workspace.project().types.worker).toBeDefined();
  });
});

describe('renaming a field', () => {
  it('renames the field, its placeholders, the inventory rows and the CSV header', async () => {
    const cards = await read('library/cards.yaml');
    await writeFile(
      path.join(dir, 'library/cards.yaml'),
      cards.replace('      cost:', '      # Paid in coins when the card is taken.\n      cost:'),
    );
    // A quoted header and Windows line endings, which must come through untouched.
    const csv = (await read('data/actions.csv'))
      .replace('name,cost,', '"name","cost",')
      .replaceAll('\n', '\r\n');
    await writeFile(path.join(dir, 'data/actions.csv'), csv);

    const result = await renameField(workspace, projectId(), 'action-card', {
      from: 'cost',
      to: 'price',
    });

    expect(result).toEqual({
      field: 'price',
      files: ['library/cards.yaml', 'inventory.yaml', 'data/actions.csv'],
    });
    const library = await read('library/cards.yaml');
    expect(library).toContain('# Paid in coins when the card is taken.\n      price: {');
    expect(library).toContain("text: '{{price}}'");
    expect(library).not.toContain('cost');
    const inventory = await read('inventory.yaml');
    expect(inventory).toContain('        price: 1\n');
    expect(inventory).toContain('{ name: Raid, price: 2, suit: red');
    expect(await read('data/actions.csv')).toBe(csv.replace('"cost"', '"price"'));
    for (const card of componentsOf('action-card')) {
      expect(card.data).toHaveProperty('price');
      expect(card.data).not.toHaveProperty('cost');
    }
  });

  it('renames the keys of `each` entries', async () => {
    const result = await renameField(workspace, projectId(), 'worker', {
      from: 'color',
      to: 'colour',
    });
    expect(result.files).toEqual(['library/pieces.yaml', 'inventory.yaml']);
    expect(await read('inventory.yaml')).toContain('each: { colour: [red, green] }\n    count: 5');
    expect(await read('library/pieces.yaml')).toContain("fill: '{{colour}}'");
    expect(componentsOf('worker')[0]!.data).toEqual({ colour: 'red' });
  });

  it('refuses names that are taken, invalid or unknown', async () => {
    const rename = (type: string, from: string, to: string) =>
      renameField(workspace, projectId(), type, { from, to });
    await expect(rename('action-card', 'cost', 'suit')).rejects.toThrow(
      '"action-card" already has a field "suit".',
    );
    await expect(rename('action-card', 'cost', 'count')).rejects.toThrow(/"count" is taken/);
    await expect(rename('action-card', 'cost', '2nd')).rejects.toThrow(
      /"2nd" is not a valid field name/,
    );
    await expect(rename('action-card', 'weight', 'mass')).rejects.toThrow(
      '"action-card" has no field "weight".',
    );
    await expect(rename('lantern', 'a', 'b')).rejects.toThrow('There is no type "lantern".');
  });
});
