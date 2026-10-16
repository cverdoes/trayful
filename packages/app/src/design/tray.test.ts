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
  withKey,
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
