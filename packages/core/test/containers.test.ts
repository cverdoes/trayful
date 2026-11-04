import { TABLE_FORMAT, type ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { applyCommand, CommandError, type Command } from './commands.js';
import { describeTable } from './describe.js';
import { AliasBook, viewFor, withoutOtherHands } from './privacy.js';
import { snapFor } from './snap.js';
import {
  bagCounts,
  checkIntegrity,
  handOf,
  type Catalog,
  type Piece,
  type Stack,
  type TableState,
} from './state.js';

/** A board with a discard pile, a row for a tableau and a bag, and things to put there. */
const catalog: Catalog = Object.fromEntries(
  (
    [
      {
        id: 'board',
        size: [200, 100],
        is: 'piece',
        container: [
          { id: 'discard', points: [[20, 20]], mode: 'pile' },
          { id: 'tableau', area: { at: [0, 60], size: [100, 30] }, mode: 'row' },
          { id: 'bag', area: { at: [150, 0], size: 50 }, mode: 'bag' },
        ],
      },
      { id: 'card', size: [20, 30], is: 'piece', flippable: true, stackable: true },
      { id: 'cube', size: 10, is: 'piece', stackable: true },
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
  const pieces = [
    // The board's top-left corner is at [0, 0].
    at('board', 'board', [100, 50], 0),
    at('card.1', 'card', [300, 0], 1),
    at('card.2', 'card', [300, 50], 2),
    at('card.3', 'card', [300, 100], 3),
    at('meeple', 'meeple', [300, 150], 4),
    ...['red', 'blue', 'green', 'white'].map((c, i) =>
      at(`cube.${c}`, 'cube', [400, i * 20], 5 + i),
    ),
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
const book = () => new AliasBook(() => String(Math.random()).slice(2));

describe('piles', () => {
  it('gathers everything put on a pile spot into one stack', () => {
    const state = run(
      table(),
      { type: 'move', ids: ['card.1'], to: 'board/discard' },
      { type: 'move', ids: ['card.2'], to: 'board/discard/0' },
      { type: 'move', ids: ['card.3'], to: 'board/discard' },
    );
    expect(checkIntegrity(state)).toEqual([]);
    const pile = Object.values(state.objects).find((o): o is Stack => o.kind === 'stack')!;
    expect(pile).toMatchObject({ snap: 'board/discard/0', pos: [20, 20] });
    expect(pile.items).toEqual(['card.1', 'card.2', 'card.3']);
  });

  it('refuses what cannot share a stack with the pile', () => {
    const state = run(table(), { type: 'move', ids: ['card.1'], to: 'board/discard' });
    expect(() => run(state, { type: 'move', ids: ['meeple'], to: 'board/discard' })).toThrow(
      /"meeple" cannot be stacked/,
    );
    expect(() => run(state, { type: 'move', ids: ['cube.red'], to: 'board/discard' })).toThrow(
      /cannot share a stack/,
    );
  });

  it('takes cards drawn and dealt onto it', () => {
    const deck = run(table(), { type: 'stack', ids: ['card.2', 'card.3'], onto: 'card.1' });
    const id = Object.keys(deck.objects).find((k) => k.startsWith('stack:'))!;
    const state = run(
      deck,
      { type: 'draw', from: id, to: 'board/discard' },
      { type: 'draw', from: id, to: 'board/discard' },
    );
    const piles = Object.values(state.objects).filter((o): o is Stack => o.kind === 'stack');
    expect(piles.find((p) => p.snap === 'board/discard/0')?.items).toEqual(['card.3', 'card.2']);
  });
});

describe('rows', () => {
  const x = (s: TableState, id: string) => piece(s, id).pos[0];

  it('lines things up from the left end, in the order they arrive', () => {
    const state = run(
      table(),
      { type: 'move', ids: ['card.1'], to: 'board/tableau' },
      { type: 'move', ids: ['card.2', 'card.3'], to: 'board/tableau' },
    );
    // The row starts at x = 0; cards are 20 wide with 2 between them.
    expect([x(state, 'card.1'), x(state, 'card.2'), x(state, 'card.3')]).toEqual([10, 32, 54]);
    expect(piece(state, 'card.2').pos[1]).toBe(75);
  });

  it('puts what is dropped between two things there, and closes up when one leaves', () => {
    const two = run(table(), { type: 'move', ids: ['card.1', 'card.2'], to: 'board/tableau' });
    const between = run(two, {
      type: 'move',
      ids: ['card.3'],
      by: [20 - 300, 75],
      into: 'board/tableau',
    });
    expect([x(between, 'card.1'), x(between, 'card.3'), x(between, 'card.2')]).toEqual([
      10, 32, 54,
    ]);
    const gone = run(between, { type: 'move', ids: ['card.3'], to: [300, 300] });
    expect([x(gone, 'card.1'), x(gone, 'card.2')]).toEqual([10, 32]);
  });

  it('runs on past its right end when things do not fit, each in full view', () => {
    const cubes = ['red', 'blue', 'green', 'white'].map((c) => `cube.${c}`);
    const full = run(
      table(),
      { type: 'move', ids: ['card.1', 'card.2', 'card.3'], to: 'board/tableau' },
      { type: 'move', ids: cubes, to: 'board/tableau' },
      { type: 'move', ids: ['meeple'], to: 'board/tableau' },
    );
    // 3 cards and 5 small pieces are 114 mm wide with their gaps, more than the row's 100.
    expect(x(full, 'card.1')).toBe(10);
    expect(x(full, 'cube.white')).toBe(107);
    // The meeple goes after the cubes that already run past the end.
    expect(x(full, 'meeple')).toBe(119);
    expect(piece(full, 'meeple').pos[1]).toBe(75);
  });
  it('takes a piece dropped half over it, as rows are often narrower than what lies in them', () => {
    // The row runs from y = 60 to 90; a free area takes only what lands inside it.
    const dropAt = (point: [number, number]) =>
      snapFor(table(), catalog, { type: catalog.card, point, radius: 10 })?.ref;
    expect([dropAt([50, 55]), dropAt([50, 98]), dropAt([50, 101])]).toEqual([
      'board/tableau',
      'board/tableau',
      undefined,
    ]);
    expect(dropAt([175, 55])).toBeUndefined();
  });

  it('takes drops anywhere along the part that runs past its end', () => {
    const cubes = ['red', 'blue', 'green', 'white'].map((c) => `cube.${c}`);
    const full = run(
      table(),
      { type: 'move', ids: ['card.1', 'card.2', 'card.3'], to: 'board/tableau' },
      { type: 'move', ids: cubes, to: 'board/tableau' },
    );
    // The cubes end at x = 112, past the row's end at 100.
    const meeple = catalog.meeple;
    const dropAt = (x: number) =>
      snapFor(full, catalog, { type: meeple, point: [x, 75], radius: 8 })?.ref;
    expect([dropAt(101), dropAt(120), dropAt(135)]).toEqual([
      'board/tableau',
      'board/tableau',
      undefined,
    ]);
    // Dropped between the green and white cubes, past the end, it goes there.
    const between = run(full, {
      type: 'move',
      ids: ['meeple'],
      by: [101 - 300, 75 - 150],
      into: 'board/tableau',
    });
    expect([x(between, 'meeple'), x(between, 'cube.white')]).toEqual([107, 119]);
    // Dropped after the last cube, it goes last.
    const last = run(full, {
      type: 'move',
      ids: ['meeple'],
      by: [118 - 300, 75 - 150],
      into: 'board/tableau',
    });
    expect([x(last, 'cube.white'), x(last, 'meeple')]).toEqual([107, 119]);
  });
});

describe('bags', () => {
  const cubes = ['red', 'blue', 'green', 'white'].map((c) => `cube.${c}`);
  const filled = () => run(table(), { type: 'move', ids: cubes, to: 'board/bag' });

  it('takes pieces out of sight, for every player and agents alike', () => {
    const state = filled();
    expect(checkIntegrity(state)).toEqual([]);
    expect(bagCounts(state)).toEqual({ 'board/bag': 4 });
    for (const viewer of ['alice', 'bob', undefined]) {
      const view = viewFor(state, viewer, book(), catalog);
      expect(Object.keys(view.objects).filter((id) => id.startsWith('cube'))).toEqual([]);
      expect(view.bags).toEqual({ 'board/bag': 4 });
    }
    expect(Object.keys(withoutOtherHands(state, 'claude').objects)).not.toContain('cube.red');
    expect(describeTable(state, catalog, { viewer: 'claude' })).toMatch(
      /board\/bag: a bag holding 4 hidden pieces/,
    );
  });

  it('takes stacks apart, and refuses to move a piece inside it', () => {
    const state = run(
      table(),
      { type: 'stack', ids: ['card.2'], onto: 'card.1' },
      { type: 'move', ids: ['stack:1'], by: [0, 0], into: 'board/bag' },
    );
    expect(state.objects['stack:1']).toBeUndefined();
    expect(bagCounts(state)).toEqual({ 'board/bag': 2 });
    expect(() => run(state, { type: 'move', ids: ['card.1'], to: [0, 0] })).toThrow(
      /in bag "board\/bag"; draw from the bag/,
    );
  });

  it('draws at random into a hand, which only that player sees', () => {
    const state = run(filled(), { type: 'draw', from: 'board/bag', count: 2, to: 'hand:alice' });
    const drawn = handOf(state, 'alice').map((p) => p.id);
    expect(drawn).toHaveLength(2);
    expect(bagCounts(state)).toEqual({ 'board/bag': 2 });
    const alice = viewFor(state, 'alice', book(), catalog);
    const bob = viewFor(state, 'bob', book(), catalog);
    expect(Object.keys(alice.objects)).toEqual(expect.arrayContaining(drawn));
    expect(Object.keys(bob.objects).some((id) => id.startsWith('cube'))).toBe(false);
    expect(bob.hands).toEqual({ alice: 2 });
    expect(bob.bags).toEqual({ 'board/bag': 2 });
    // The same table draws the same pieces; another seed may not.
    const again = run(filled(), { type: 'draw', from: 'board/bag', count: 2, to: 'hand:alice' });
    expect(handOf(again, 'alice').map((p) => p.id)).toEqual(drawn);
  });

  it('draws onto the table, and says when the bag runs out', () => {
    const state = run(filled(), { type: 'draw', from: 'board/bag', count: 4, to: [500, 500] });
    expect(bagCounts(state)).toEqual({});
    expect(Object.values(state.objects).find((o) => o.kind === 'stack')?.pos).toEqual([500, 500]);
    expect(() => run(state, { type: 'draw', from: 'board/bag', to: [0, 0] })).toThrow(
      /holds 0 pieces; cannot draw 1/,
    );
    expect(() => run(state, { type: 'draw', from: 'board/tableau', to: [0, 0] })).toThrow(
      CommandError,
    );
  });
});
