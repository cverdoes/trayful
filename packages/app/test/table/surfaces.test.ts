import type { TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  changedSurfaces,
  defaultChoice,
  hasSurfaces,
  loadChoice,
  saveChoice,
  shownSurfaces,
  surfaceColor,
  tileLayout,
  tilesFor,
  toggled,
  TOOLBAR_HEIGHT,
  CHIP_ROW_HEIGHT,
} from '../../src/table/surfaces';
import { after, exampleTable, fakeStorage } from '../helpers';

let project: ResolvedProject;
let table: TableState;
/** The example table with a seat for Alice and one for Bob, and a shared side table. */
let seated: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
  seated = after(
    project,
    table,
    { type: 'addSurface', id: 'alice', seat: true },
    { type: 'addSurface', id: 'bob', seat: true },
    { type: 'addSurface', id: 'side' },
    { type: 'sit', surface: 'alice', player: 'alice' },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('which surfaces show', () => {
  it('shows chips and tiles only on a table with surfaces', () => {
    expect(hasSurfaces(table)).toBe(false);
    expect(hasSurfaces(seated)).toBe(true);
  });

  it('starts a seated viewer on their own surfaces and the Centre, anyone else on all', () => {
    expect(defaultChoice(seated, 'alice')).toEqual({ preset: 'mine' });
    expect(defaultChoice(seated, 'bob')).toEqual({ preset: 'all' });
    expect(defaultChoice(seated, undefined)).toEqual({ preset: 'all' });
  });

  it('follows a preset, the Centre always first', () => {
    expect(shownSurfaces(seated, { preset: 'all' }, 'alice')).toEqual([
      'centre',
      'alice',
      'bob',
      'side',
    ]);
    expect(shownSurfaces(seated, { preset: 'mine' }, 'alice')).toEqual(['centre', 'alice']);
    expect(shownSurfaces(seated, { preset: 'centre' }, 'alice')).toEqual(['centre']);
  });

  it('shows a focused surface alone, unless it is gone', () => {
    expect(shownSurfaces(seated, { preset: 'all' }, 'alice', 'bob')).toEqual(['bob']);
    expect(shownSurfaces(seated, { preset: 'all' }, 'alice', 'nope')).toHaveLength(4);
  });

  it('switches surfaces one by one, and never shows nothing', () => {
    const noBob = toggled(seated, { preset: 'all' }, 'alice', 'bob');
    expect(noBob).toEqual({ hidden: ['bob'] });
    expect(shownSurfaces(seated, noBob, 'alice')).toEqual(['centre', 'alice', 'side']);
    expect(toggled(seated, noBob, 'alice', 'bob')).toEqual({ hidden: [] });
    const none = { hidden: ['centre', 'alice', 'bob', 'side'] };
    expect(shownSurfaces(seated, none, 'alice')).toEqual(['centre']);
  });

  it('tells which surfaces something changed on', () => {
    const moved = after(project, seated, {
      type: 'move',
      ids: ['worker.red.1'],
      to: 'surface:bob',
    });
    expect(changedSurfaces(seated, moved)).toEqual(new Set(['centre', 'bob']));
    expect(changedSurfaces(moved, moved)).toEqual(new Set());
    const gone = after(project, moved, { type: 'move', ids: ['worker.red.1'], to: 'hand:alice' });
    expect(changedSurfaces(moved, gone)).toContain('bob');
  });
});

describe('surfaceColor', () => {
  it('looks a colour name up in the project colours, or takes the colour as given', () => {
    const colors = { red: '#c5523a' };
    expect(surfaceColor({ color: 'red' }, colors)).toBe('#c5523a');
    expect(surfaceColor({ color: 'teal' }, colors)).toBe('teal');
    expect(surfaceColor({}, colors)).toBeUndefined();
    expect(surfaceColor(undefined, colors)).toBeUndefined();
  });
});

describe('tile layout', () => {
  const area = { x: 0, y: 0, width: 1008, height: 600 };

  it('gives one surface the whole area', () => {
    expect(tileLayout(['centre'], area)).toEqual([{ surface: 'centre', box: area }]);
  });

  it('puts the Centre large on the left, the others in a column beside it', () => {
    const [centre, alice, bob] = tileLayout(['centre', 'alice', 'bob'], area);
    expect(centre!.box).toEqual({ x: 0, y: 0, width: 620, height: 600 });
    expect(alice!.box).toEqual({ x: 628, y: 0, width: 380, height: 296 });
    expect(bob!.box).toEqual({ x: 628, y: 304, width: 380, height: 296 });
  });

  it('puts the Centre on top in a tall window, the others in a row under it', () => {
    const tall = { x: 0, y: 0, width: 400, height: 1008 };
    const [centre, alice, bob] = tileLayout(['centre', 'alice', 'bob'], tall);
    expect(centre!.box.height).toBe(620);
    expect(alice!.box).toMatchObject({ x: 0, y: 628, width: 196 });
    expect(bob!.box).toMatchObject({ x: 204, y: 628, width: 196 });
  });

  it('shares the area evenly without the Centre', () => {
    const boxes = tileLayout(['alice', 'bob'], area).map((t) => t.box.width);
    expect(boxes).toEqual([500, 500]);
  });

  it('leaves the page as it was for a table without surfaces', () => {
    const [tile] = tilesFor(table, ['centre'], { width: 1000, height: 800, hand: 150 });
    expect(tile!.box).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(tile!.clear).toEqual({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width: 1000,
      height: 800 - TOOLBAR_HEIGHT - 150,
    });
  });

  it('lays tiles out under the chips and over the hand tray', () => {
    const tiles = tilesFor(seated, ['centre', 'alice'], { width: 1000, height: 800, hand: 150 });
    expect(tiles.map((t) => t.surface)).toEqual(['centre', 'alice']);
    for (const { box, clear } of tiles) {
      expect(box.y).toBe(TOOLBAR_HEIGHT + CHIP_ROW_HEIGHT);
      expect(box.y + box.height).toBeLessThanOrEqual(800 - 150);
      expect(clear.y).toBeGreaterThan(box.y);
    }
  });
});

describe('keeping the choice', () => {
  it('remembers a choice per table', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveChoice('p/t1', { hidden: ['bob'] });
    saveChoice('p/t2', { preset: 'centre' });
    expect(loadChoice('p/t1')).toEqual({ hidden: ['bob'] });
    expect(loadChoice('p/t2')).toEqual({ preset: 'centre' });
    expect(loadChoice('p/t3')).toBeUndefined();
  });

  it('ignores anything else stored there, and works without storage', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    storage.setItem('trayful.surfaces:p/a', '{"preset":"most"}');
    storage.setItem('trayful.surfaces:p/b', '{"hidden":[1]}');
    storage.setItem('trayful.surfaces:p/c', 'not json');
    expect(loadChoice('p/a')).toBeUndefined();
    expect(loadChoice('p/b')).toBeUndefined();
    expect(loadChoice('p/c')).toBeUndefined();
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveChoice('p/a', { preset: 'all' })).not.toThrow();
    expect(loadChoice('p/a')).toBeUndefined();
  });
});
