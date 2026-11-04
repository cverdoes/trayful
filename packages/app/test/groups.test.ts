import { TABLE_FORMAT, type ComponentType } from '@trayful/formats/browser';
import type { Piece, TableState } from '@trayful/core';
import { describe, expect, it } from 'vitest';
import { groupMembers, pickEntries, pickerCorner, pickFor, raise } from './groups';

const types: Record<string, ComponentType> = {
  board: {
    id: 'board',
    size: [100, 50],
    is: 'piece',
    container: [
      {
        id: 'track',
        points: [
          [10, 10],
          [30, 10],
        ],
        mode: 'group',
      },
      { id: 'slots', points: [[70, 10]] },
    ],
  },
  marker: { id: 'marker', size: 8, is: 'piece' },
};

const piece = (id: string, type: string, z: number, snap?: string): Piece => ({
  kind: 'piece',
  id,
  type,
  pos: [0, 0],
  rot: 0,
  face: 'up',
  z,
  snap,
});

const table: TableState = {
  format: TABLE_FORMAT,
  table: 't',
  seed: 1,
  rng: 1,
  objects: Object.fromEntries(
    [
      piece('board', 'board', 0),
      piece('red', 'marker', 1, 'board/track/0'),
      piece('blue', 'marker', 3, 'board/track/0'),
      piece('green', 'marker', 2, 'board/track/1'),
      piece('white', 'marker', 4, 'board/slots/0'),
      piece('black', 'marker', 5, 'board/slots/0'),
      { ...piece('chip', 'marker', 0), parent: 'pile' },
      {
        kind: 'stack' as const,
        id: 'pile',
        pos: [0, 0] as [number, number],
        rot: 0,
        z: 6,
        items: ['chip'],
      },
    ].map((p) => [p.id, p]),
  ),
};

describe('groupMembers', () => {
  it('lists the pieces sharing a group spot, top first', () => {
    expect(groupMembers(table, types, 'red')).toEqual(['blue', 'red']);
  });

  it('is nothing for a piece alone on its spot, or on a spot of another mode', () => {
    expect(groupMembers(table, types, 'green')).toBeUndefined();
    expect(groupMembers(table, types, 'white')).toBeUndefined();
    expect(groupMembers(table, types, 'board')).toBeUndefined();
  });
});

describe('raise', () => {
  it('moves a piece nowhere, back into its spot, which brings it to the top', () => {
    expect(raise('red', 'board/track/0')).toEqual({
      type: 'move',
      ids: ['red'],
      by: [0, 0],
      into: 'board/track/0',
    });
  });
});

describe('the picker', () => {
  const at = { x: 50, y: 60 };

  it('opens for a piece in a crowded group, where it was clicked', () => {
    expect(pickFor(table, types, 'blue', at)).toEqual({
      spot: 'board/track/0',
      ids: ['blue', 'red'],
      at,
    });
    expect(pickFor(table, types, 'green', at)).toBeUndefined();
  });

  it('shows a stack by its top piece, and leaves out what has left the group', () => {
    const withPile = {
      ...table,
      objects: { ...table.objects, pile: { ...table.objects.pile!, snap: 'board/track/0' } },
    };
    const ids = ['red', 'pile', 'green', 'gone'];
    expect(pickEntries(withPile, { spot: 'board/track/0', ids })).toEqual([
      { id: 'red', piece: table.objects.red },
      { id: 'pile', piece: table.objects.chip },
    ]);
  });

  it('stays clear of the edges of the window', () => {
    expect(pickerCorner(at, { width: 1000, height: 800 })).toEqual(at);
    expect(pickerCorner({ x: 990, y: 790 }, { width: 1000, height: 800 })).toEqual({
      x: 620,
      y: 560,
    });
    expect(pickerCorner(at, { width: 200, height: 100 })).toEqual({ x: 0, y: 0 });
  });
});
