import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCommand, CommandError, type Command } from './commands.js';
import { createTable } from './setup.js';
import { checkIntegrity, handOf, type Piece, type TableState } from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let project: ResolvedProject;
let setUp: TableState;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
  // The two-player setup: the board in place, five market cards dealt, workers below.
  setUp = createTable(project, { name: 'test', seed: 42 });
});

const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, project.types), state);
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const workers = ['red', 'green'].flatMap((c) => [1, 2, 3, 4, 5].map((n) => `worker.${c}.${n}`));

describe('commands refuse what they cannot do', () => {
  it.each<[string, Command, string]>([
    ['no objects', { type: 'flip', ids: [] }, 'No objects given.'],
    ['an unknown id', { type: 'flip', ids: ['nope'] }, 'No object with id "nope".'],
    ['by and to', { type: 'move', ids: ['coins'], by: [1, 1], to: [0, 0] }, 'exactly one of'],
    ['a locked object', { type: 'move', ids: ['main-board'], by: [1, 1] }, 'is locked'],
    [
      'into with a snap target',
      { type: 'move', ids: ['coins'], to: 'main-board/supply', into: 'main-board/supply' },
      'Give "into" only with "by" or a position.',
    ],
    [
      'into a whole grid',
      { type: 'move', ids: ['worker.red.1'], by: [0, 0], into: 'main-board/fields' },
      '"into" needs one spot or area',
    ],
    [
      'more objects than free spots',
      { type: 'move', ids: workers, to: 'main-board/fields' },
      '"main-board/fields" has 8 free spots; 10 objects need one each.',
    ],
    ['a value on a stack', { type: 'setValue', id: 'deck:actions', value: 1 }, 'is a stack'],
    ['a piece as a stack', { type: 'shuffle', id: 'coins' }, '"coins" is not a stack.'],
    ['stacking onto itself', { type: 'stack', ids: ['coins'], onto: 'coins' }, 'onto itself'],
    ['dealing nowhere', { type: 'deal', from: 'deck:actions', to: [] }, 'at least one place'],
    [
      'a bad position',
      { type: 'draw', from: 'deck:actions', to: [1, 2, 3] as never },
      '[x, y] pair',
    ],
    ['a bad count', { type: 'draw', from: 'deck:actions', count: 0, to: [0, 0] }, '"count"'],
    ['taking a stack', { type: 'take', id: 'deck:actions', to: [0, 0] }, 'use draw or move'],
    ['a bad layout', { type: 'layout', id: 'deck:actions', layout: 'heap' as never }, 'pile, fan'],
    ['an unknown snap target', { type: 'move', ids: ['coins'], to: 'nowhere/x' }, 'No piece'],
    [
      'a full snap target',
      { type: 'draw', from: 'deck:actions', to: 'main-board/market' },
      'Every spot of "main-board/market" is taken.',
    ],
  ])('refuses %s', (_, command, message) => {
    expect(() => run(setUp, command)).toThrow(CommandError);
    expect(() => run(setUp, command)).toThrow(message);
  });

  it('refuses pieces of an unknown type', () => {
    const odd = {
      ...setUp,
      objects: { ...setUp.objects, coins: { ...piece(setUp, 'coins'), type: 'gold' } },
    };
    expect(() => run(odd, { type: 'roll', id: 'coins' })).toThrow('Unknown component type "gold".');
  });
});

describe('hands', () => {
  it('takes a stack apart into a hand, top card first', () => {
    const s = run(setUp, { type: 'move', ids: ['deck:actions'], to: 'hand:ann' });
    expect(s.objects['deck:actions']).toBeUndefined();
    const hand = handOf(s, 'ann');
    expect(hand).toHaveLength(5);
    expect(checkIntegrity(s)).toEqual([]);
  });

  it('passes pieces from one hand to another, and refuses mixing them with table pieces', () => {
    const s = run(setUp, { type: 'move', ids: ['coins'], to: 'hand:ann' });
    expect(() => run(s, { type: 'move', ids: ['coins', 'd6.1'], to: [0, 0] })).toThrow(
      'separately',
    );
    const passed = run(s, { type: 'move', ids: ['coins'], to: 'hand:bo' });
    expect(piece(passed, 'coins').hand).toBe('bo');
  });
});

describe('snapping', () => {
  /** The table with the coins sitting on a die, as if the die had a snap target. */
  const coinsOnDie = (die: Partial<Piece> = {}): TableState => ({
    ...setUp,
    objects: {
      ...setUp.objects,
      coins: { ...piece(setUp, 'coins'), snap: 'd6.1/top' },
      'd6.1': { ...piece(setUp, 'd6.1'), ...die },
    },
  });

  it('drops snaps that point at a piece no longer on the table', () => {
    const s = run(coinsOnDie({ hand: 'ann' }), { type: 'lock', ids: ['coins'], locked: true });
    expect(piece(s, 'coins').snap).toBeUndefined();
  });

  it('leaves riders on the table when the piece they sit on goes into a hand', () => {
    const s = run(coinsOnDie(), { type: 'move', ids: ['d6.1'], to: 'hand:ann' });
    expect(piece(s, 'd6.1').hand).toBe('ann');
    expect(piece(s, 'coins')).toMatchObject({ pos: piece(setUp, 'coins').pos });
    expect(piece(s, 'coins').snap).toBeUndefined();
  });
});
