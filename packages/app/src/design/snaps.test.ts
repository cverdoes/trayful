import type { ComponentType, SnapTarget } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { draggedTarget, newTarget, spotsOf, targetHandles, withPoint } from './snaps';

const board: ComponentType = { id: 'board', is: 'piece', size: [300, 200] };
const grid: SnapTarget = { id: 'fields', grid: { origin: [10, 20], cols: 3, rows: 2, cell: 10 } };

it('numbers a grid’s spots row by row, as setups name them', () => {
  expect(spotsOf(grid)).toEqual([
    [10, 20],
    [20, 20],
    [30, 20],
    [10, 30],
    [20, 30],
    [30, 30],
  ]);
  expect(spotsOf({ id: 'supply', area: { at: [0, 0], size: 10 } })).toEqual([]);
});

it('starts new targets near the middle under ids not taken', () => {
  const taken = { ...board, container: [{ id: 'grid-1', points: [[0, 0]] }] } as ComponentType;
  expect(newTarget('grid', taken, [300, 200])).toEqual({
    id: 'grid-2',
    grid: { origin: [140, 90], cols: 2, rows: 2, cell: 20 },
  });
  expect(newTarget('points', board, [300, 200])).toEqual({ id: 'points-1', points: [[150, 100]] });
  expect(newTarget('area', board, [300, 200])).toEqual({
    id: 'area-1',
    area: { at: [130, 80], size: 40 },
  });
  expect(newTarget('pile', board, [300, 200])).toEqual({
    id: 'pile-1',
    points: [[150, 100]],
    mode: 'pile',
  });
  expect(newTarget('group', board, [300, 200])).toEqual({
    id: 'group-1',
    points: [[150, 100]],
    mode: 'group',
  });
  expect(newTarget('row', board, [300, 200])).toMatchObject({ id: 'row-1', mode: 'row' });
  expect(newTarget('bag', board, [300, 200])).toEqual({
    id: 'bag-1',
    area: { at: [135, 85], size: 30 },
    mode: 'bag',
  });
});

describe('dragging a grid', () => {
  const handle = (kind: string) => targetHandles(grid).find(([h]) => h.kind === kind)![0];

  it('has handles apart from each other, even with one spot', () => {
    expect(targetHandles(grid).map(([, p]) => p)).toEqual([
      [10, 20],
      [15, 25],
      [37.5, 37.5],
    ]);
    const one: SnapTarget = { id: 'one', grid: { origin: [0, 0], cols: 1, rows: 1, cell: 10 } };
    const points = targetHandles(one).map(([, p]) => p.join());
    expect(new Set(points).size).toBe(3);
  });

  it('moves it by its first spot', () => {
    expect(draggedTarget(grid, handle('origin'), [50, 50]).grid?.origin).toEqual([50, 50]);
  });

  it('spaces it by the handle halfway to the spot diagonal to the first', () => {
    expect(draggedTarget(grid, handle('cell'), [17.5, 27.5]).grid?.cell).toBe(15);
    expect(draggedTarget(grid, handle('cell'), [20, 27.5]).grid?.cell).toEqual([20, 15]);
  });

  it('adds columns and rows by the handle past its last spot', () => {
    expect(draggedTarget(grid, handle('extent'), [57.5, 47.5]).grid).toMatchObject({
      cols: 5,
      rows: 3,
    });
    expect(draggedTarget(grid, handle('extent'), [0, 0]).grid).toMatchObject({ cols: 1, rows: 1 });
  });
});

it('moves and adds the points of a track', () => {
  const track: SnapTarget = {
    id: 'track',
    points: [
      [0, 0],
      [10, 0],
    ],
  };
  expect(draggedTarget(track, { kind: 'point', index: 1 }, [12, 3]).points).toEqual([
    [0, 0],
    [12, 3],
  ]);
  expect(withPoint(track, [20, 0]).points).toHaveLength(3);
});

it('moves an area by its corner and sizes it by the opposite one', () => {
  const area: SnapTarget = { id: 'supply', area: { at: [10, 10], size: 20 } };
  expect(draggedTarget(area, { kind: 'area' }, [0, 5]).area).toEqual({ at: [0, 5], size: 20 });
  expect(draggedTarget(area, { kind: 'area-size' }, [40, 20]).area).toEqual({
    at: [10, 10],
    size: [30, 10],
  });
});
