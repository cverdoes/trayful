import { TABLE_FORMAT, type ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands.js';
import { describeTable } from './describe.js';
import { markBoxes } from './marks.js';
import { AliasBook, viewFor } from './privacy.js';
import { snapFor } from './snap.js';
import type { Catalog, Piece, TableState } from './state.js';

/** A score sheet with a grid of boxes to tick, a box for the total, and two stamps. */
const catalog: Catalog = Object.fromEntries(
  (
    [
      {
        id: 'sheet',
        size: [100, 60],
        is: 'piece',
        flippable: true,
        container: [
          {
            id: 'boxes',
            grid: { origin: [10, 10], cols: 3, rows: 2, cell: 10 },
            mode: 'stamp',
            accepts: ['cross'],
          },
          { id: 'any', points: [[60, 10]], mode: 'stamp' },
          { id: 'total', points: [[80, 50]], mode: 'text' },
          { id: 'pile', points: [[80, 10]], mode: 'pile' },
        ],
      },
      { id: 'cross', size: 8, is: 'stamp' },
      { id: 'circle', size: 12, is: 'stamp' },
      { id: 'meeple', size: 10, is: 'piece' },
    ] satisfies ComponentType[]
  ).map((t) => [t.id, t]),
);

const at = (id: string, type: string, pos: [number, number], z: number): Piece => ({
  kind: 'piece',
  id,
  type,
  pos,
  rot: 0,
  face: 'up',
  z,
});

function table(): TableState {
  const pieces = [at('sheet', 'sheet', [50, 30], 0), at('meeple', 'meeple', [200, 0], 1)];
  return {
    format: TABLE_FORMAT,
    table: 't',
    seed: 1,
    rng: 1,
    objects: Object.fromEntries(pieces.map((p) => [p.id, p])),
  };
}

const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, catalog), state);
const sheet = (s: TableState) => s.objects.sheet as Piece;

describe('marks', () => {
  it('stamps a spot and writes on another, keeping them on the sheet', () => {
    const state = run(
      table(),
      { type: 'mark', at: 'sheet/boxes/4', stamp: 'cross' },
      { type: 'mark', at: 'sheet/any/0', stamp: 'circle' },
      { type: 'mark', at: 'sheet/total/0', text: '  42 ' },
    );
    expect(sheet(state).marks).toEqual({
      'boxes/4': { stamp: 'cross' },
      'any/0': { stamp: 'circle' },
      'total/0': { text: '42' },
    });
  });

  it('replaces what was on a spot, and erases it', () => {
    const marked = run(
      table(),
      { type: 'mark', at: 'sheet/total/0', text: '4' },
      { type: 'mark', at: 'sheet/total/0', text: '5' },
    );
    expect(sheet(marked).marks).toEqual({ 'total/0': { text: '5' } });
    const erased = run(marked, { type: 'erase', at: 'sheet/total/0' });
    expect(sheet(erased).marks).toBeUndefined();
    expect(() => run(erased, { type: 'erase', at: 'sheet/total/0' })).toThrow(/nothing to erase/);
  });

  it('refuses the wrong kind of mark, a stamp the spot does not take, and a whole area', () => {
    const t = table();
    expect(() => run(t, { type: 'mark', at: 'sheet/boxes/0', stamp: 'circle' })).toThrow(
      /takes the stamps cross, not "circle"/,
    );
    expect(() => run(t, { type: 'mark', at: 'sheet/boxes/0', text: 'x' })).toThrow(
      /takes a stamp, not text/,
    );
    expect(() => run(t, { type: 'mark', at: 'sheet/total/0', stamp: 'cross' })).toThrow(
      /takes text, not a stamp/,
    );
    expect(() => run(t, { type: 'mark', at: 'sheet/total/0', text: ' ' })).toThrow(/Give some/);
    expect(() => run(t, { type: 'mark', at: 'sheet/total/0', text: 'x'.repeat(201) })).toThrow(
      /limited to 200/,
    );
    expect(() => run(t, { type: 'mark', at: 'sheet/boxes', stamp: 'cross' })).toThrow(
      /Name one spot/,
    );
    expect(() => run(t, { type: 'mark', at: 'sheet/pile/0', stamp: 'cross' })).toThrow(
      /not a stamp or text spot/,
    );
  });

  it('keeps pieces out of stamp and text spots', () => {
    expect(() => run(table(), { type: 'move', ids: ['meeple'], to: 'sheet/boxes/0' })).toThrow(
      /takes stamps, not pieces/,
    );
    const drop = { type: catalog.meeple, point: [65, 10] as [number, number], radius: 20 };
    expect(snapFor(table(), catalog, drop)?.ref).toBe('sheet/pile/0');
  });

  it('marks a locked sheet, and takes the marks along when the sheet moves', () => {
    const state = run(
      table(),
      { type: 'lock', ids: ['sheet'], locked: true },
      { type: 'mark', at: 'sheet/boxes/0', stamp: 'cross' },
      { type: 'lock', ids: ['sheet'], locked: false },
      { type: 'move', ids: ['sheet'], by: [10, 0] },
    );
    expect(sheet(state).marks).toEqual({ 'boxes/0': { stamp: 'cross' } });
  });

  it('hides the marks of a face-down sheet', () => {
    const state = run(
      table(),
      { type: 'mark', at: 'sheet/total/0', text: 'secret' },
      { type: 'flip', ids: ['sheet'] },
    );
    expect(describeTable(state, catalog)).toContain('- sheet/total: 1 text spot, face down');
    expect(describeTable(state, catalog, { reveal: true })).toContain('marked 0: "secret"');
    const view = viewFor(state, undefined, new AliasBook(() => 'x'), catalog);
    const hidden = Object.values(view.objects).find(
      (o) => o.kind === 'piece' && o.type === 'sheet',
    );
    expect(hidden).not.toHaveProperty('marks');
  });

  it('tells agents what each spot holds', () => {
    const state = run(
      table(),
      { type: 'mark', at: 'sheet/boxes/1', stamp: 'cross' },
      { type: 'mark', at: 'sheet/total/0', text: '12' },
    );
    const text = describeTable(state, catalog);
    expect(text).toContain(
      '- sheet/boxes: 6 stamp spots (stamps cross), marked 1: cross, empty 0, 2-5',
    );
    expect(text).toContain('- sheet/any: 1 stamp spot (stamps cross, circle), empty 0');
    expect(text).toContain('- sheet/total: 1 text spot, marked 0: "12", none empty');
    expect(text).toContain('- sheet/pile: 1 piles, free 0');
    expect(text).not.toContain('sheet/boxes: 6 spots');
  });

  it('lists the boxes of a sheet, sized by their cell or their largest stamp, with their marks', () => {
    const state = run(table(), { type: 'mark', at: 'sheet/any/0', stamp: 'cross' });
    const boxes = markBoxes(sheet(state), catalog).map((b) => ({
      key: b.key,
      size: b.size,
      stamps: b.stamps.map((t) => t.id),
      mark: b.mark,
    }));
    expect(boxes.slice(5)).toEqual([
      { key: 'boxes/5', size: [10, 10], stamps: ['cross'], mark: undefined },
      { key: 'any/0', size: [12, 12], stamps: ['cross', 'circle'], mark: { stamp: 'cross' } },
      { key: 'total/0', size: [10, 10], stamps: [], mark: undefined },
    ]);
  });
});
