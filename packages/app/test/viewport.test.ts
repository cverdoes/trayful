import type { TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HAND_HEIGHT } from './handTray';
import { useStore } from './store';
import { exampleTable } from './testing';
import { fitToTable, outOfView, tableBounds, toWorld, TOOLBAR_HEIGHT, zoomAt } from './viewport';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

beforeEach(() => {
  useStore.setState({ viewport: { x: 0, y: 0, scale: 1 } });
});

describe('tableBounds', () => {
  it('holds every object on the table', () => {
    const [x0, y0, x1, y1] = tableBounds(table, project.types)!;
    expect(x0).toBeLessThanOrEqual(-270);
    expect(x1).toBeGreaterThanOrEqual(350);
    expect(y0).toBeLessThan(y1);
  });

  it('is nothing for an empty table', () => {
    expect(tableBounds({ ...table, objects: {} }, project.types)).toBeUndefined();
  });
});

describe('fitToTable', () => {
  it('fits the table between the toolbar and the hand tray', () => {
    fitToTable(table, project.types, 1600, 1000);
    const { viewport } = useStore.getState();
    expect(outOfView(tableBounds(table, project.types)!, viewport, 1600, 1000)).toBe(false);
  });

  it('leaves the view alone for an empty table', () => {
    fitToTable({ ...table, objects: {} }, project.types, 1600, 1000);
    expect(useStore.getState().viewport).toEqual({ x: 0, y: 0, scale: 1 });
  });
});

describe('zoomAt', () => {
  it('keeps the table point under the pointer in place', () => {
    useStore.setState({ viewport: { x: 100, y: 50, scale: 2 } });
    const before = toWorld(useStore.getState().viewport, { x: 300, y: 200 });
    zoomAt({ x: 300, y: 200 }, 1.5);
    const { viewport } = useStore.getState();
    expect(viewport.scale).toBe(3);
    const [x, y] = toWorld(viewport, { x: 300, y: 200 });
    expect(x).toBeCloseTo(before[0]);
    expect(y).toBeCloseTo(before[1]);
  });

  it('stops at the closest and farthest zoom', () => {
    zoomAt({ x: 0, y: 0 }, 1000);
    expect(useStore.getState().viewport.scale).toBe(12);
    zoomAt({ x: 0, y: 0 }, 0.00001);
    expect(useStore.getState().viewport.scale).toBeCloseTo(0.2);
  });
});

describe('outOfView', () => {
  const viewport = { x: 0, y: 0, scale: 1 };
  it('sees a box under the toolbar or the hand tray, or off the screen', () => {
    expect(outOfView([10, TOOLBAR_HEIGHT, 100, 500 - HAND_HEIGHT], viewport, 800, 500)).toBe(false);
    expect(outOfView([10, 0, 100, 100], viewport, 800, 500)).toBe(true);
    expect(outOfView([10, 100, 100, 500], viewport, 800, 500)).toBe(true);
    expect(outOfView([-1, 100, 100, 200], viewport, 800, 500)).toBe(true);
    expect(outOfView([10, 100, 900, 200], viewport, 800, 500)).toBe(true);
  });
});
