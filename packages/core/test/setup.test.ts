import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import type { SetupStep } from '@trayful/formats/browser';
import { beforeAll, describe, expect, it } from 'vitest';
import { applySetup, createTable, SetupError } from './setup.js';
import { checkIntegrity, type Piece, type Stack, type TableState } from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let project: ResolvedProject;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
});

const box = () => createTable(project, { name: 'test', seed: 42, setup: false });

/** Runs steps as a setup called "custom" on a table fresh out of the box. */
function run(...steps: SetupStep[]): TableState {
  const custom = { ...project, setups: { custom: { kind: 'setup' as const, file: '', steps } } };
  return applySetup(box(), custom, 'custom');
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
