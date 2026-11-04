import { TABLE_FORMAT, type ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands.js';
import { describeTable } from './describe.js';
import { snapFor } from './snap.js';
import type { Catalog, Piece, TableState } from './state.js';

/** A board with a score track whose spaces hold groups, a free region, and pieces for both. */
const catalog: Catalog = Object.fromEntries(
  (
    [
      {
        id: 'board',
        size: [200, 100],
        is: 'piece',
        container: [
          {
            id: 'track',
            points: [
              [20, 20],
              [60, 20],
            ],
            mode: 'group',
          },
          { id: 'region', area: { at: [100, 0], size: [100, 100] } },
        ],
      },
      { id: 'marker', size: 10, is: 'piece' },
      { id: 'army', size: [10, 20], is: 'piece' },
      { id: 'chip', size: 10, is: 'piece', stackable: true },
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
  const pieces = [
    // The board's top-left corner is at [0, 0].
    at('board', 'board', [100, 50], 0),
    ...['red', 'blue', 'green', 'white'].map((c, i) =>
      at(`marker.${c}`, 'marker', [300, i * 20], 1 + i),
    ),
    ...[1, 2, 3].map((n) => at(`army.${n}`, 'army', [400, n * 30], 10 + n)),
    ...[1, 2].map((n) => at(`chip.${n}`, 'chip', [500, n * 20], 20 + n)),
  ];
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
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const markers = ['marker.red', 'marker.blue', 'marker.green'];

describe('groups', () => {
  it('keeps everything on a group spot as separate pieces, spread around the spot', () => {
    const state = run(table(), { type: 'move', ids: markers, to: 'board/track/0' });
    expect(Object.values(state.objects).some((o) => o.kind === 'stack')).toBe(false);
    const spots = markers.map((id) => piece(state, id));
    expect(spots.every((p) => p.snap === 'board/track/0')).toBe(true);
    expect(new Set(spots.map((p) => p.pos.join())).size).toBe(3);
    // Close to the spot at [20, 20]: within the size of one marker.
    for (const p of spots) expect(Math.hypot(p.pos[0] - 20, p.pos[1] - 20)).toBeLessThan(10);
  });

  it('lets any one piece of a group be moved straight off it, and closes up the rest', () => {
    let state = run(table(), { type: 'move', ids: markers, to: 'board/track/0' });
    state = run(state, { type: 'move', ids: ['marker.blue'], to: 'board/track/1' });
    expect(piece(state, 'marker.blue')).toMatchObject({ snap: 'board/track/1', pos: [60, 20] });
    const left = ['marker.green', 'marker.red'].map((id) => piece(state, id).pos);
    expect(left[0]![1]).toBe(20);
    expect(left[0]![0] + left[1]![0]).toBeCloseTo(40, 0);
  });

  it('keeps its places when a piece in it is brought to the top', () => {
    const state = run(table(), { type: 'move', ids: markers, to: 'board/track/0' });
    const raised = run(state, {
      type: 'move',
      ids: ['marker.red'],
      by: [0, 0],
      into: 'board/track/0',
    });
    for (const id of markers) expect(piece(raised, id).pos).toEqual(piece(state, id).pos);
    expect(piece(raised, 'marker.red').z).toBeGreaterThan(piece(state, 'marker.green').z);
  });

  it('is always a spot to drop on, even when something lies there', () => {
    const state = run(table(), { type: 'move', ids: ['marker.red'], to: 'board/track/0' });
    const spot = snapFor(state, catalog, { type: catalog.marker, point: [22, 20], radius: 15 });
    expect(spot?.ref).toBe('board/track/0');
  });

  it('is described with every piece it holds', () => {
    const state = run(table(), { type: 'move', ids: markers, to: 'board/track/0' });
    expect(describeTable(state, catalog)).toMatch(
      /board\/track: 2 group spots \(each holds any number of separate pieces\), taken 0: marker\.red, marker\.blue, marker\.green, free 1/,
    );
  });
});

describe('free areas', () => {
  it('put what an agent moves there in the middle, then beside what lies there', () => {
    const state = run(
      table(),
      { type: 'move', ids: ['army.1'], to: 'board/region' },
      { type: 'move', ids: ['army.2'], to: 'board/region' },
      { type: 'move', ids: ['army.3'], to: 'board/region' },
    );
    expect(piece(state, 'army.1').pos).toEqual([150, 50]);
    const boxes = ['army.1', 'army.2', 'army.3'].map((id) => piece(state, id).pos);
    for (const [x, y] of boxes) {
      expect(x).toBeGreaterThanOrEqual(105);
      expect(x).toBeLessThanOrEqual(195);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(90);
    }
    // No two armies overlap.
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i]!, boxes[j]!];
        expect(Math.abs(a[0] - b[0]) >= 10 || Math.abs(a[1] - b[1]) >= 20).toBe(true);
      }
  });

  it('put what is drawn or taken there in free room too', () => {
    const state = run(
      table(),
      { type: 'move', ids: ['army.1'], to: 'board/region' },
      { type: 'stack', ids: ['chip.2'], onto: 'chip.1' },
    );
    const stack = Object.values(state.objects).find((o) => o.kind === 'stack')!;
    const drawn = run(state, { type: 'draw', from: stack.id, to: 'board/region' });
    expect(piece(drawn, 'chip.2').pos).not.toEqual([150, 50]);
    expect(piece(drawn, 'chip.2').snap).toBe('board/region');
  });
});
