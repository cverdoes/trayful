import { loadProject, type ResolvedProject } from '@trayful/formats';
import type { SetupStep, SetupSurface } from '@trayful/formats/browser';
import { beforeAll, describe, expect, it } from 'vitest';
import { applySetup, createTable, keepSeats, SetupError } from '../src/setup.js';
import { checkIntegrity, type Piece, type Stack, type TableState } from '../src/table/state.js';
import { examplePath } from './paths.js';

const example = examplePath('harvest-moon');

let project: ResolvedProject;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
});

const box = () => createTable(project, { name: 'test', seed: 42, setup: false });

/** Runs steps as a setup called "custom" on a table fresh out of the box. */
function run(...steps: SetupStep[]): TableState {
  return runWith(undefined, ...steps);
}

/** The same, for a setup that makes surfaces first. */
function runWith(surfaces: SetupSurface[] | undefined, ...steps: SetupStep[]): TableState {
  const setup = { kind: 'setup' as const, file: '', steps, ...(surfaces ? { surfaces } : {}) };
  return applySetup(box(), { ...project, setups: { custom: setup } }, 'custom');
}

const piece = (s: TableState, id: string) => s.objects[id] as Piece;

describe('createTable', () => {
  it("uses the manifest's setup unless told otherwise", () => {
    const table = createTable(project, { name: 'test', seed: 42 });
    expect(piece(table, 'main-board').pos).toEqual([0, 0]);
    expect(checkIntegrity(table)).toEqual([]);
  });

  it('names the known setups when asked for an unknown one', () => {
    expect(() => createTable(project, { name: 'test', setup: 'solo' })).toThrow(
      'Unknown setup "solo". Known setups: 2-player.',
    );
    expect(() => createTable({ ...project, setups: {} }, { name: 'test', setup: 'solo' })).toThrow(
      'The project has no setups.',
    );
  });
});

describe('applySetup', () => {
  it('refuses an unknown setup', () => {
    expect(() => applySetup(box(), project, 'solo')).toThrow(SetupError);
  });

  it('takes a card out of its deck, rotated and turned as asked', () => {
    const table = run({ place: 'action-card.harvest.1', at: [100, 100], rot: 90, face: 'up' });
    const card = piece(table, 'action-card.harvest.1');
    expect(card).toMatchObject({ pos: [100, 100], rot: 90, face: 'up' });
    expect(card.parent).toBeUndefined();
    expect((table.objects['deck:actions'] as Stack).items).not.toContain(card.id);
  });

  it('lays out at an angle what players cannot turn', () => {
    expect(piece(run({ place: 'd6.1', at: [0, 0], rot: 45 }), 'd6.1').rot).toBe(45);
  });

  it('moves what the setup did not use below what it placed', () => {
    const table = run({ place: 'main-board', at: [0, 0] });
    const board = piece(table, 'main-board');
    expect(board.locked).toBeUndefined();
    expect(piece(table, 'coins').pos[1]).toBeGreaterThan(board.pos[1]);
  });

  it('locks what a step places when it says lock', () => {
    const table = run({ place: 'main-board', at: [0, 0], lock: true });
    expect(piece(table, 'main-board').locked).toBe(true);
    expect(piece(run({ place: 'worker', at: [0, 0], lock: true }), 'worker.red.3').locked).toBe(
      true,
    );
  });

  it('places a locked piece again, and keeps it locked', () => {
    const table = run(
      { place: 'main-board', at: [0, 0], lock: true },
      { place: 'main-board', at: [100, 50] },
    );
    expect(piece(table, 'main-board')).toMatchObject({ pos: [100, 50], locked: true });
  });

  it('deals one card to each of the first spots of a snap target', () => {
    const table = run(
      { place: 'main-board', at: [0, 0] },
      { shuffle: 'actions' },
      { deal: { from: 'actions', to: 'main-board/market', count: 2, face: 'up' } },
    );
    const dealt = Object.values(table.objects).filter((o) =>
      o.snap?.startsWith('main-board/market'),
    );
    expect(dealt.map((o) => o.snap).sort()).toEqual(['main-board/market/0', 'main-board/market/1']);
  });

  it('draws to a single place', () => {
    const table = run({ deal: { from: 'actions', to: [500, 0], count: 3 } });
    expect(Object.values(table.objects).some((o) => o.kind === 'stack' && o.pos[0] === 500)).toBe(
      true,
    );
  });

  it('says which step failed, and why', () => {
    const cases: [SetupStep[], string][] = [
      [[{ shuffle: 'events' }], 'step 1: Deck "events" is not on the table any more.'],
      [[{ place: 'lantern', at: [0, 0] }], 'step 1: No "lantern" left to place.'],
      [[{ place: 'coins', at: [0, 0], face: 'down' }], 'step 1: "coins" has only one side.'],
      [
        [
          { place: 'main-board', at: [0, 0] },
          { deal: { from: 'actions', to: 'main-board/market', count: 6 } },
        ],
        'step 2: "main-board/market" has 5 spots; cannot deal 6 cards.',
      ],
      [[{ place: 'worker', at: 'nowhere/spot' }], 'step 1: No piece "nowhere" on the table.'],
    ];
    for (const [steps, message] of cases) {
      expect(() => run(...steps)).toThrow(message);
    }
  });
});

describe('setups with surfaces', () => {
  const surfaces: SetupSurface[] = [
    { id: 'red', name: 'Red player', seat: true },
    { id: 'blue', seat: true },
    { id: 'discard' },
  ];

  it('makes its surfaces first, in tile order', () => {
    const table = runWith(surfaces);
    expect(table.surfaces).toEqual([
      { id: 'red', name: 'Red player', seat: true },
      { id: 'blue', name: 'blue', seat: true },
      { id: 'discard', name: 'discard' },
    ]);
    expect(checkIntegrity(table)).toEqual([]);
  });

  it('places at a position on a surface, or in free room there', () => {
    const table = runWith(
      surfaces,
      { place: 'worker.red.1', at: [10, 20], surface: 'red' },
      { place: 'worker.red.2', at: 'surface:blue' },
    );
    expect(piece(table, 'worker.red.1')).toMatchObject({ surface: 'red', pos: [10, 20] });
    expect(piece(table, 'worker.red.2').surface).toBe('blue');
  });

  it('deals cards onto a surface', () => {
    const table = runWith(surfaces, {
      deal: { from: 'actions', to: [0, 0], count: 2, face: 'up', surface: 'discard' },
    });
    const dealt = Object.values(table.objects).find(
      (o) => o.kind === 'stack' && o.surface === 'discard',
    ) as Stack;
    expect(dealt.items).toHaveLength(2);
  });

  it('leaves what it does not use below the layout on the Centre', () => {
    const table = runWith(surfaces, { place: 'main-board', at: [0, 0] });
    const leftovers = Object.values(table.objects).filter(
      (o) => o.kind === 'piece' && !o.parent && o.id !== 'main-board',
    );
    expect(leftovers.every((o) => o.surface === undefined)).toBe(true);
  });

  it('says which step names an unknown surface, or a surface with a named place', () => {
    expect(() =>
      runWith(surfaces, { place: 'worker.red.1', at: [0, 0], surface: 'green' }),
    ).toThrow(/step 1: .*green/);
    expect(() =>
      runWith(surfaces, { place: 'worker.red.1', at: 'main-board/supply', surface: 'red' }),
    ).toThrow(/step 1: "surface" goes with an \[x, y\] position/);
    expect(() =>
      runWith(surfaces, {
        deal: { from: 'actions', to: 'main-board/market', count: 2, surface: 'red' },
      }),
    ).toThrow(/step 1: "surface" goes with an \[x, y\] position/);
    expect(() => runWith([{ id: 'centre' }])).toThrow(/surface "centre"/);
  });
});

describe('keepSeats', () => {
  const seated = (surfaces: TableState['surfaces']): TableState => ({ ...box(), surfaces });

  it('seats players where they sat before, at seats the new table also has', () => {
    const before = seated([
      { id: 'red', name: 'Red', seat: true, player: 'ann' },
      { id: 'blue', name: 'Blue', seat: true, player: 'bo' },
    ]);
    const fresh = seated([
      { id: 'red', name: 'Red', seat: true },
      { id: 'green', name: 'Green', seat: true },
    ]);
    expect(keepSeats(before, fresh).surfaces).toEqual([
      { id: 'red', name: 'Red', seat: true, player: 'ann' },
      { id: 'green', name: 'Green', seat: true },
    ]);
  });

  it('seats nobody at a surface that is no longer a seat, or on a table without surfaces', () => {
    const before = seated([{ id: 'red', name: 'Red', seat: true, player: 'ann' }]);
    const fresh = seated([{ id: 'red', name: 'Red' }]);
    expect(keepSeats(before, fresh)).toEqual(fresh);
    expect(keepSeats(before, box())).toEqual(box());
  });
});
