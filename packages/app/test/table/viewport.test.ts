import type { TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAND_HEIGHT } from '../../src/table/handTray';
import { useStore } from '../../src/store';
import { exampleTable } from '../helpers';
import { tilesFor, TOOLBAR_HEIGHT, type Tile } from '../../src/table/surfaces';
import {
  fitTile,
  outOfView,
  tableBounds,
  toWorld,
  viewportOf,
  zoomAt,
} from '../../src/table/viewport';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

beforeEach(() => {
  useStore.setState({ viewports: {} });
});

const centre = () => viewportOf(useStore.getState(), 'centre');
const clearOf = (tile: Tile) => ({
  ...tile.clear,
  x: tile.clear.x - tile.box.x,
  y: tile.clear.y - tile.box.y,
});

describe('tableBounds', () => {
  it('holds every object on the table', () => {
    const [x0, y0, x1, y1] = tableBounds(table, project.types)!;
    expect(x0).toBeLessThanOrEqual(-270);
    expect(x1).toBeGreaterThanOrEqual(350);
    expect(y0).toBeLessThan(y1);
  });

  it('is nothing for an empty table, or a surface with nothing on it', () => {
    expect(tableBounds({ ...table, objects: {} }, project.types)).toBeUndefined();
    expect(tableBounds(table, project.types, 'alice')).toBeUndefined();
  });
});

describe('fitTile', () => {
  const page = { width: 1600, height: 1000, hand: HAND_HEIGHT };

  it('fits the table between the toolbar and the hand tray', () => {
    const [tile] = tilesFor(table, ['centre'], page);
    expect(tile!.clear).toEqual({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width: 1600,
      height: 1000 - TOOLBAR_HEIGHT - HAND_HEIGHT,
    });
    fitTile(table, project.types, tile!);
    expect(outOfView(tableBounds(table, project.types)!, centre(), clearOf(tile!))).toBe(false);
  });

  it('fits each surface into its own tile', () => {
    const split = { ...table, surfaces: [{ id: 'alice', name: 'Alice' }] };
    const tiles = tilesFor(split, ['centre', 'alice'], page);
    for (const tile of tiles) fitTile(split, project.types, tile);
    expect(outOfView(tableBounds(split, project.types)!, centre(), clearOf(tiles[0]!))).toBe(false);
  });

  it('puts the origin of an empty surface in the middle of its tile', () => {
    const [tile] = tilesFor(table, ['centre'], page);
    fitTile({ ...table, objects: {} }, project.types, tile!);
    const [x, y] = toWorld(centre(), {
      x: 800,
      y: TOOLBAR_HEIGHT + (1000 - TOOLBAR_HEIGHT - HAND_HEIGHT) / 2,
    });
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
  });
});

describe('zoomAt', () => {
  it('keeps the table point under the pointer in place', () => {
    useStore.setState({ viewports: { centre: { x: 100, y: 50, scale: 2 } } });
    const before = toWorld(centre(), { x: 300, y: 200 });
    zoomAt('centre', { x: 300, y: 200 }, 1.5);
    expect(centre().scale).toBe(3);
    const [x, y] = toWorld(centre(), { x: 300, y: 200 });
    expect(x).toBeCloseTo(before[0]);
    expect(y).toBeCloseTo(before[1]);
  });

  it('stops at the closest and farthest zoom', () => {
    zoomAt('centre', { x: 0, y: 0 }, 1000);
    expect(centre().scale).toBe(12);
    zoomAt('centre', { x: 0, y: 0 }, 0.00001);
    expect(centre().scale).toBeCloseTo(0.2);
  });

  it('zooms one surface and leaves the others alone', () => {
    zoomAt('alice', { x: 0, y: 0 }, 2);
    expect(viewportOf(useStore.getState(), 'alice').scale).toBe(2);
    expect(centre().scale).toBe(1);
  });
});

describe('outOfView', () => {
  const viewport = { x: 0, y: 0, scale: 1 };
  const clear = { x: 0, y: TOOLBAR_HEIGHT, width: 800, height: 500 - TOOLBAR_HEIGHT - HAND_HEIGHT };
  it('sees a box under the toolbar or the hand tray, or off the screen', () => {
    expect(outOfView([10, TOOLBAR_HEIGHT, 100, 500 - HAND_HEIGHT], viewport, clear)).toBe(false);
    expect(outOfView([10, 0, 100, 100], viewport, clear)).toBe(true);
    expect(outOfView([10, 100, 100, 500], viewport, clear)).toBe(true);
    expect(outOfView([-1, 100, 100, 200], viewport, clear)).toBe(true);
    expect(outOfView([10, 100, 900, 200], viewport, clear)).toBe(true);
  });
});
