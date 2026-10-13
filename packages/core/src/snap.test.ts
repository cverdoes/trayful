import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCommand, CommandError, type Command } from './commands.js';
import { describeTable } from './describe.js';
import { stackOffsets } from './layout.js';
import { createTable, SetupError } from './setup.js';
import { resolveSpots, snapFor } from './snap.js';
import { checkIntegrity, type Piece, type Stack, type TableState } from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let project: ResolvedProject;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
});

const setUp = () => createTable(project, { name: 'test', seed: 7 });
const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, project.types), state);
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const unlock = (s: TableState) => run(s, { type: 'lock', ids: ['main-board'], locked: false });
const near = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));

describe('setups', () => {
  it('starts a new table from the manifest setup', () => {
    const state = setUp();
    expect(checkIntegrity(state)).toEqual([]);
    expect(piece(state, 'main-board').pos).toEqual([0, 0]);
    const market = Object.values(state.objects).filter((o) =>
      o.snap?.startsWith('main-board/market/'),
    );
    expect(market.map((o) => o.snap).sort()).toEqual(
      [0, 1, 2, 3, 4].map((i) => `main-board/market/${i}`),
    );
    expect(market.every((o) => o.kind === 'piece' && o.face === 'up')).toBe(true);
    expect(piece(state, 'score-marker.red').snap).toBe('main-board/score-track/0');
    expect(piece(state, 'coins').snap).toBe('main-board/supply');
    expect((state.objects['deck:actions'] as Stack).items).toHaveLength(5);
  });

  it('can still start straight out of the box', () => {
    const state = createTable(project, { name: 'test', seed: 7, setup: false });
    expect(Object.values(state.objects).some((o) => o.snap)).toBe(false);
  });

  it('is the same every time for the same seed', () => {
    expect(setUp()).toEqual(setUp());
  });

  it('names the step that went wrong', () => {
    const broken = {
      ...project,
      setups: {
        bad: {
          kind: 'setup' as const,
          file: 'setups/bad.yaml',
          steps: [{ deal: { from: 'actions', to: 'main-board/market', count: 9 } }],
        },
      },
    };
    expect(() => createTable(broken, { name: 't', setup: 'bad' })).toThrow(SetupError);
    expect(() => createTable(broken, { name: 't', setup: 'bad' })).toThrow(/step 1: .*5 spots/);
    expect(() => createTable(broken, { name: 't', setup: 'nope' })).toThrow(/Unknown setup "nope"/);
  });
});

describe('snap targets', () => {
  it('resolves spots by board id or by its type', () => {
    const state = setUp();
    const spots = resolveSpots(state, project.types, 'main-board/fields');
    expect(spots).toHaveLength(8);
    // Origin [110, 200] on a 600 × 400 board centred at [0, 0].
    expect(spots[0]!.pos).toEqual([-190, 0]);
    expect(spots[5]!.pos).toEqual([-140, 50]);
    expect(() => resolveSpots(state, project.types, 'main-board/fields/8')).toThrow(/0 to 7/);
    expect(() => resolveSpots(state, project.types, 'main-board/nope')).toThrow(/no snap target/);
  });

  it('moves a worker into a spot, and only where it is accepted', () => {
    let state = setUp();
    state = run(state, { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/2' });
    expect(piece(state, 'worker.red.1')).toMatchObject({
      pos: [-90, 0],
      snap: 'main-board/fields/2',
    });
    expect(() =>
      run(state, { type: 'move', ids: ['worker.red.2'], to: 'main-board/market/0' }),
    ).toThrow(/only accepts action-card/);
  });

  it('fills the free spots of a whole target in order', () => {
    let state = setUp();
    state = run(state, { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/0' });
    state = run(state, {
      type: 'move',
      ids: ['worker.red.2', 'worker.red.3'],
      to: 'main-board/fields',
    });
    expect(piece(state, 'worker.red.2').snap).toBe('main-board/fields/1');
    expect(piece(state, 'worker.red.3').snap).toBe('main-board/fields/2');
  });

  it('forgets the spot when a piece is moved off it', () => {
    let state = setUp();
    state = run(
      state,
      { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/0' },
      { type: 'move', ids: ['worker.red.1'], by: [0, 300] },
    );
    expect(piece(state, 'worker.red.1').snap).toBeUndefined();
  });

  it('carries pieces along when their board moves or turns', () => {
    let state = unlock(setUp());
    state = run(state, { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/0' });
    state = run(state, { type: 'move', ids: ['main-board'], by: [100, 50] });
    expect(piece(state, 'worker.red.1').pos).toEqual([-90, 50]);
    expect(piece(state, 'worker.red.1').snap).toBe('main-board/fields/0');
    expect(piece(state, 'worker.red.1').z).toBeGreaterThan(piece(state, 'main-board').z);
    // The market cards ride along too.
    expect(piece(state, 'coins').pos[0]).toBeCloseTo(310);

    state = run(state, { type: 'rotate', ids: ['main-board'], steps: 1 });
    // A quarter turn clockwise around the board centre [100, 50]: offset [-190, 0] becomes [0, -190].
    near(piece(state, 'worker.red.1').pos, [100, -140]);
    expect(piece(state, 'worker.red.1').rot).toBe(90);
    near(resolveSpots(state, project.types, 'main-board/fields/0')[0]!.pos, [100, -140]);
  });

  it('does not let a board be put onto itself', () => {
    const state = unlock(setUp());
    expect(() =>
      run(state, { type: 'move', ids: ['main-board'], to: 'main-board/supply' }),
    ).toThrow(/onto itself/);
  });

  it('records a spot without moving, with "into"', () => {
    const state = run(setUp(), {
      type: 'move',
      ids: ['d6.1'],
      by: [5, 5],
      into: 'main-board/supply',
    });
    expect(piece(state, 'd6.1').snap).toBe('main-board/supply');
  });

  it('draws and deals into spots', () => {
    let state = setUp();
    state = run(state, { type: 'draw', from: 'deck:actions', to: 'main-board/market/1' });
    // The drawn card lies on top of the card already in the spot.
    const inSpot = Object.values(state.objects).filter((o) => o.snap === 'main-board/market/1');
    expect(inSpot).toHaveLength(2);
    expect(() =>
      run(state, { type: 'deal', from: 'deck:actions', to: 'main-board/fields' }),
    ).toThrow(/only accepts worker/);
  });

  it('keeps a pile in its spot when a card is stacked onto a card there', () => {
    let state = setUp();
    const card = Object.values(state.objects).find((o) => o.snap === 'main-board/market/0')!;
    state = run(state, { type: 'draw', from: 'deck:actions', to: [500, 500] });
    const drawn = Object.values(state.objects).find(
      (o) => o.kind === 'piece' && o.pos[0] === 500 && o.pos[1] === 500,
    )!;
    state = run(state, { type: 'stack', ids: [drawn.id], onto: card.id });
    const pile = Object.values(state.objects).find(
      (o) => o.kind === 'stack' && o.items.includes(card.id),
    );
    expect(pile?.snap).toBe('main-board/market/0');
  });

  it('suggests the nearest free accepting spot when dropping', () => {
    const state = setUp();
    const worker = project.types.worker;
    // Field spot 0 is at [-190, 0], spot 1 at [-140, 0].
    expect(snapFor(state, project.types, worker, [-185, 4], 20)?.ref).toBe('main-board/fields/0');
    expect(snapFor(state, project.types, worker, [-165, 0], 10)).toBeUndefined();
    const card = project.types['action-card'];
    expect(snapFor(state, project.types, card, [-185, 4], 20)).toBeUndefined();
    expect(snapFor(state, project.types, card, [215, 55], 5)?.ref).toBe('main-board/supply');
  });
});

describe('taking and laying out stacks', () => {
  it('takes one card from the middle of a pile', () => {
    let state = setUp();
    const deck = state.objects['deck:actions'] as Stack;
    const middle = deck.items[2]!;
    state = run(state, { type: 'take', id: middle, to: [0, 300], face: 'up' });
    expect((state.objects['deck:actions'] as Stack).items).not.toContain(middle);
    expect(piece(state, middle)).toMatchObject({ pos: [0, 300], face: 'up' });
    expect(piece(state, middle).parent).toBeUndefined();
    expect(checkIntegrity(state)).toEqual([]);
    expect(() => run(state, { type: 'take', id: middle, to: [0, 0] })).toThrow(CommandError);
  });

  it('fans and spreads a stack, and shows its cards when spread', () => {
    let state = setUp();
    state = run(state, { type: 'layout', id: 'deck:actions', layout: 'spread' });
    expect((state.objects['deck:actions'] as Stack).layout).toBe('spread');
    expect(describeTable(state, project.types)).toMatch(/deck:actions: .*spread out/);
    state = run(state, { type: 'layout', id: 'deck:actions', layout: 'pile' });
    expect((state.objects['deck:actions'] as Stack).layout).toBeUndefined();
  });

  it('lays fanned and spread cards out in a row around the centre', () => {
    expect(stackOffsets(undefined, 3, [60, 90])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(stackOffsets('spread', 3, [60, 90])).toEqual([
      [-63, 0],
      [0, 0],
      [63, 0],
    ]);
    expect(stackOffsets('fan', 2, [60, 90])).toEqual([
      [-9, 0],
      [9, 0],
    ]);
  });
});

describe('describing snap targets', () => {
  it('lists each target with its taken and free spots', () => {
    const text = describeTable(setUp(), project.types);
    expect(text).toContain('- main-board/fields (accepts worker): 8 spots, free 0-7');
    expect(text).toMatch(
      /- main-board\/market \(accepts action-card\): 5 spots, taken 0: action-card/,
    );
    expect(text).toMatch(
      /- main-board\/supply: free area of 140 × 140 mm centred at \[210, 50\], holding coins, d6\.1, d6\.2/,
    );
    expect(text).toMatch(/score-marker\.red: .*in main-board\/score-track\/0/);
  });
});
