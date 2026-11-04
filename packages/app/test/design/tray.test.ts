import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  columnsOf,
  designCount,
  everyTile,
  newEntry,
  replaced,
  shapeOf,
  tiledImage,
  nextColumn,
  withColumn,
  withKey,
  withoutColumn,
  withUsedTables,
  withValue,
} from './tray';

const terrain: ComponentType = {
  id: 'terrain',
  name: 'Terrain tile',
  size: 50,
  is: 'piece',
  fields: { name: 'string?' },
  face: { shape: 'hex', image: { asset: 'terrain', tile: 'instance' } },
};
const images = { terrain: { file: 'assets/terrain.png', rows: 4, cols: 6 } };

describe('the Tray', () => {
  it('fills in the tile first, then the fields', () => {
    expect(columnsOf(terrain).map((c) => c.name)).toEqual(['tile', 'name']);
  });

  it('makes one design per tile of the sheet a component picks from, as a deck', () => {
    const image = tiledImage(terrain, images)!;
    const entry = everyTile(terrain, image);
    expect(entry.deck).toBe('terrain-tile');
    expect(shapeOf(entry)).toBe('each');
    expect(designCount(entry, {})).toBe(24);
    expect(tiledImage({ ...terrain, face: { image: 'terrain' } }, images)).toBeUndefined();
  });

  it('counts the designs of each shape of entry', () => {
    const tables = { 'data/t.csv': { header: ['name'], rows: [['a'], ['b'], ['c']] } };
    expect(designCount(newEntry('one'), tables)).toBe(1);
    expect(designCount({ items: [{}, {}] }, tables)).toBe(2);
    expect(designCount({ each: { a: [1, 2], b: ['x', 'y', 'z'] } }, tables)).toBe(6);
    expect(designCount({ from: 'data/t.csv' }, tables)).toBe(3);
    expect(shapeOf({ from: 'data/t.csv' })).toBe('csv');
  });

  it('takes out values and keys that are cleared, so the file stays short', () => {
    expect(withValue({ name: 'Forest' }, 'name', undefined)).toBeUndefined();
    expect(withValue(undefined, 'tile', 3)).toEqual({ tile: 3 });
    expect(withKey({ deck: 'terrain', count: 2 }, 'deck', undefined)).toEqual({ count: 2 });
    expect(replaced(['a', 'b', 'c'], 1, undefined)).toEqual(['a', 'c']);
    expect(replaced(['a', 'b'], 0, 'z')).toEqual(['z', 'b']);
  });
});

describe('CSV tables', () => {
  const table = {
    header: ['title', 'cost'],
    rows: [
      ['Storm', '2'],
      ['Feast', '1'],
    ],
  };

  it('adds and takes out columns in every row', () => {
    expect(withColumn(table, 'suit')).toEqual({
      header: ['title', 'cost', 'suit'],
      rows: [
        ['Storm', '2', ''],
        ['Feast', '1', ''],
      ],
    });
    expect(withoutColumn(table, 0)).toEqual({ header: ['cost'], rows: [['2'], ['1']] });
  });

  it('names a new column after the first field without one', () => {
    const field = { type: 'string', optional: true } as const;
    const columns = ['title', 'suit'].map((name) => ({ name, field }));
    expect(nextColumn(table, columns)).toBe('suit');
    expect(nextColumn(withColumn(table, 'suit'), columns)).toBe('');
  });

  it('sends only the CSV files the entries still read', () => {
    const tray = { entries: [{ from: 'a.csv' }], tables: { 'a.csv': table, 'b.csv': table } };
    expect(Object.keys(withUsedTables(tray).tables)).toEqual(['a.csv']);
  });
});
