import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  broughtIn,
  columnsOf,
  designRows,
  withDesignRows,
  designCount,
  everyTile,
  newEntry,
  pieceCount,
  replaced,
  shapeOf,
  tiledImage,
  nextColumn,
  withColumn,
  withKey,
  withoutColumn,
  withUsedTables,
  withValue,
} from '../../../src/design/tray/tray';

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
    expect(designCount(newEntry('rows'), tables)).toBe(1);
    expect(designCount({ data: { name: 'Forest' } }, tables)).toBe(1);
    expect(designCount({ items: [{}, {}] }, tables)).toBe(2);
    expect(designCount({ each: { a: [1, 2], b: ['x', 'y', 'z'] } }, tables)).toBe(6);
    expect(designCount({ from: 'data/t.csv' }, tables)).toBe(3);
    expect(shapeOf({ from: 'data/t.csv' })).toBe('csv');
  });

  it('counts the pieces an entry puts in the box', () => {
    const tables = {
      'data/t.csv': {
        header: ['name', 'count'],
        rows: [
          ['a', '2'],
          ['b', ''],
          ['c', 'x'],
        ],
      },
      'data/plain.csv': { header: ['name'], rows: [['a'], ['b']] },
    };
    expect(pieceCount({ data: { name: 'Forest' } }, tables)).toBe(1);
    expect(pieceCount({ count: 3, items: [{ count: 2 }, {}] }, tables)).toBe(5);
    expect(pieceCount({ count: 2, each: { a: [1, 2], b: ['x', 'y', 'z'] } }, tables)).toBe(12);
    // A row's own count wins; an empty or unreadable one leaves it to the entry.
    expect(pieceCount({ count: 3, from: 'data/t.csv' }, tables)).toBe(8);
    expect(pieceCount({ from: 'data/plain.csv' }, tables)).toBe(2);
    expect(pieceCount({ from: 'data/missing.csv' }, tables)).toBe(0);
  });

  it('takes out values and keys that are cleared, so the file stays short', () => {
    expect(withValue({ name: 'Forest' }, 'name', undefined)).toBeUndefined();
    expect(withValue(undefined, 'tile', 3)).toEqual({ tile: 3 });
    expect(withKey({ deck: 'terrain', count: 2 }, 'deck', undefined)).toEqual({ count: 2 });
    expect(replaced(['a', 'b', 'c'], 1, undefined)).toEqual(['a', 'c']);
    expect(replaced(['a', 'b'], 0, 'z')).toEqual(['z', 'b']);
  });
});

describe('designs typed into an entry', () => {
  it('are rows, whether the inventory has one design or several', () => {
    expect(designRows({})).toEqual([{}]);
    expect(designRows({ data: { name: 'Forest' } })).toEqual([{ name: 'Forest' }]);
    expect(designRows({ items: [{ tile: 1 }, { tile: 2 }] })).toEqual([{ tile: 1 }, { tile: 2 }]);
  });

  it('stay one design in the inventory until there is more to say', () => {
    expect(withDesignRows({ deck: 'land' }, [{ name: 'Forest' }])).toEqual({
      deck: 'land',
      data: { name: 'Forest' },
    });
    expect(withDesignRows({ data: { name: 'Forest' } }, [{}])).toEqual({});
  });

  it('become items with a second row, or with copies of their own', () => {
    const forest = { count: 2, data: { name: 'Forest' } };
    expect(withDesignRows(forest, [{ name: 'Forest' }, {}])).toEqual({
      count: 2,
      items: [{ name: 'Forest' }, {}],
    });
    expect(withDesignRows(forest, [{ name: 'Forest', count: 3 }])).toEqual({
      count: 2,
      items: [{ name: 'Forest', count: 3 }],
    });
  });

  it('stay items once they are, and keep the values the entry shares', () => {
    const entry = { data: { suit: 'red' }, items: [{ name: 'Raid' }, { name: 'Storm' }] };
    expect(withDesignRows(entry, [{ name: 'Raid' }])).toEqual({
      data: { suit: 'red' },
      items: [{ name: 'Raid' }],
    });
  });

  it("come in from a CSV file as values of their fields' kinds", () => {
    const columns = columnsOf({
      ...terrain,
      fields: { name: 'string', cost: 'int', wild: 'bool?', suit: { enum: ['red', 2] } },
    });
    const table = {
      header: ['name', 'cost', 'wild', 'suit', 'count', 'note', ''],
      rows: [
        ['Forest', '2', 'yes', '2', '3', 'x', 'y'],
        ['7', 'many', '', 'red', '', '', ''],
      ],
    };
    expect(broughtIn({ deck: 'land', count: 2, from: 'data/land.csv' }, table, columns)).toEqual({
      deck: 'land',
      count: 2,
      items: [
        { name: 'Forest', cost: 2, wild: true, suit: 2, count: 3, note: 'x' },
        // Text that is no number stays, for the project's checks to report.
        { name: '7', cost: 'many', suit: 'red' },
      ],
    });
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
