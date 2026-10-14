import { describe, expect, it } from 'vitest';
import type { ResolvedType } from './resolved.js';
import type { SetupStep } from './schemas.js';
import { snapSpotCount, stepProblems, type Loaded } from './setup-checks.js';

const board = {
  id: 'board',
  base: 'board',
  snap: [
    { id: 'row', grid: { origin: [0, 0], cols: 3, rows: 1, cell: 10 } },
    { id: 'pool', area: { at: [0, 0], size: 10 } },
  ],
} as unknown as ResolvedType;

const loaded: Loaded = {
  types: { board, card: { id: 'card', base: 'card' } as unknown as ResolvedType },
  components: [
    { id: 'board', type: 'board', data: {} },
    { id: 'card.a', type: 'card', data: {} },
    { id: 'card.b', type: 'card', data: {} },
  ],
  decks: { main: ['card.a', 'card.b'] },
  brokenTypes: new Set(['typo']),
  brokenDecks: new Set(['broken']),
};

const messages = (step: SetupStep) => stepProblems(step, loaded).map((p) => p.message);

describe('stepProblems', () => {
  it('accepts steps that refer to things that exist', () => {
    expect(messages({ place: 'board', at: [0, 0] })).toEqual([]);
    expect(messages({ place: { deck: 'main' }, at: 'board/row/2', shuffle: true })).toEqual([]);
    expect(messages({ deal: { from: 'main', to: 'board/pool', count: 1 } })).toEqual([]);
    expect(messages({ shuffle: 'main' })).toEqual([]);
  });

  it('reports unknown pieces and decks, and shuffling a single piece', () => {
    expect(stepProblems({ place: 'nope', at: [0, 0], shuffle: true }, loaded)).toEqual([
      { path: ['place'], message: '"nope" is neither a type id nor a component id.' },
      { path: ['shuffle'], message: 'Only a deck can be shuffled.' },
    ]);
    expect(stepProblems({ deal: { from: 'side', to: [0, 0], count: 1 } }, loaded)).toEqual([
      { path: ['deal', 'from'], message: 'Unknown deck "side".' },
    ]);
  });

  it('stays quiet about types and decks already reported as broken', () => {
    expect(messages({ place: 'typo', at: 'typo/row' })).toEqual([]);
    expect(messages({ shuffle: 'broken' })).toEqual([]);
  });

  it('checks snap target references', () => {
    const target = (at: string) => messages({ place: 'board', at });
    expect(target('board')).toEqual([
      '"board" should look like "board/target" or "board/target/index".',
    ]);
    expect(target('table/row')).toEqual([
      '"table" is not a component id or a type in the inventory.',
    ]);
    expect(target('card/row')).toEqual([
      'There are 2 components of type "card"; use a component id such as "card.a".',
    ]);
    expect(target('board/column')).toEqual(['"board" has no snap target "column".']);
    expect(target('board/pool/0')).toEqual([
      'Snap target "pool" is an area and has no numbered spots.',
    ]);
    expect(target('board/row/3')).toEqual(['Spot 3 is out of range; "row" has spots 0 to 2.']);
  });
});

describe('snapSpotCount', () => {
  it('counts grid cells and points, and has no count for an area', () => {
    expect(snapSpotCount({ id: 'g', grid: { origin: [0, 0], cols: 3, rows: 2, cell: 1 } })).toBe(6);
    expect(
      snapSpotCount({
        id: 'p',
        points: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toBe(2);
    expect(snapSpotCount({ id: 'a', area: { at: [0, 0], size: 1 } })).toBeUndefined();
  });
});
