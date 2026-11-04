import { startValue, TABLE_FORMAT, type ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands.js';
import { describeTable, queryObjects } from './describe.js';
import { seedState } from './rng.js';
import { checkIntegrity, type Catalog, type Piece, type Stack, type TableState } from './state.js';

/** Components with one behaviour each, so every test can say which one it is about. */
const types: ComponentType[] = [
  {
    id: 'board',
    size: [200, 100],
    is: 'piece',
    container: [{ id: 'slot', area: { at: [100, 50], size: 80 } }],
  },
  {
    id: 'tile',
    size: 20,
    is: 'piece',
    flippable: true,
    rotates: { step: 60 },
    stackable: { with: ['chit'] },
  },
  { id: 'chit', size: 10, is: 'piece', stackable: true },
  { id: 'coin', size: 10, is: 'piece', stackable: true },
  { id: 'pawn', size: 10, is: 'piece' },
  { id: 'area', size: 50, is: 'zone' },
  { id: 'd6', size: 16, is: 'die' },
  { id: 'dial', size: 16, is: 'counter', values: { range: [1, 5], controls: ['roll', 'step'] } },
  { id: 'fate', size: 16, is: 'die', values: { list: ['sword', 'shield', 'skull'] } },
  { id: 'omen', size: 16, is: 'die', values: { list: ['sun', 'moon'], controls: ['step'] } },
];
const catalog: Catalog = Object.fromEntries(types.map((t) => [t.id, t]));

/** One piece of each component, side by side; dice and counters start at their first value. */
function table(): TableState {
  const objects: Record<string, Piece> = {};
  types.forEach((type, z) => {
    const { id } = type;
    const piece: Piece = { kind: 'piece', id, type: id, pos: [z * 300, 0], rot: 0, face: 'up', z };
    const value = startValue(type);
    if (value !== undefined) piece.value = value;
    objects[id] = piece;
  });
  return { format: TABLE_FORMAT, table: 't', seed: 1, rng: seedState(1), objects };
}

const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, catalog), state);
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const refuses = (command: Command, message: RegExp, state = table()) =>
  expect(() => run(state, command)).toThrow(message);
const locked = (...ids: string[]) => run(table(), { type: 'lock', ids, locked: true });

describe('locked pieces', () => {
  it('cannot be flipped, turned, moved or taken into a hand', () => {
    const state = locked('tile');
    refuses({ type: 'flip', ids: ['tile'] }, /"tile" is locked, so it cannot be flipped/, state);
    refuses({ type: 'rotate', ids: ['tile'], steps: 1 }, /cannot be turned/, state);
    refuses({ type: 'move', ids: ['tile'], by: [1, 0] }, /"tile" is locked/, state);
    refuses({ type: 'move', ids: ['tile'], to: 'hand:ann' }, /"tile" is locked/, state);
  });

  it('stay on the table when their stack goes into a hand', () => {
    // Commands cannot lock a piece inside a stack, but a table file can say so.
    const pile = run(table(), { type: 'stack', ids: ['tile'], onto: 'chit' });
    const tile = { ...piece(pile, 'tile'), locked: true };
    const state = { ...pile, objects: { ...pile.objects, tile } };
    refuses({ type: 'draw', from: tile.parent!, to: 'hand:ann' }, /stays on the table/, state);
  });

  it('still take drops when they are containers, and let pieces be dragged off', () => {
    let state = run(locked('board'), { type: 'move', ids: ['pawn'], to: 'board/slot' });
    expect(piece(state, 'pawn')).toMatchObject({ pos: [40, 40], snap: 'board/slot' });
    state = run(state, { type: 'move', ids: ['pawn'], by: [0, 300] });
    expect(piece(state, 'pawn').snap).toBeUndefined();
    expect(piece(state, 'board').pos).toEqual([0, 0]);
  });
});

describe('behaviours', () => {
  it('turns only components that rotate, by their own step', () => {
    refuses({ type: 'rotate', ids: ['pawn'], steps: 1 }, /"pawn" does not rotate/);
    refuses({ type: 'rotate', ids: ['tile'] }, /exactly one of "steps" or "degrees"/);
    const state = run(table(), { type: 'rotate', ids: ['tile'], steps: 2 });
    expect(piece(state, 'tile').rot).toBe(120);
    expect(piece(run(state, { type: 'rotate', ids: ['tile'], steps: -3 }), 'tile').rot).toBe(300);
  });

  it('flips only flippable components', () => {
    refuses({ type: 'flip', ids: ['pawn'] }, /"pawn" has only one side/);
    expect(piece(run(table(), { type: 'flip', ids: ['tile'] }), 'tile').face).toBe('down');
  });

  it('rolls only what has the roll control', () => {
    refuses({ type: 'roll', id: 'omen' }, /"omen" cannot be rolled/);
    refuses({ type: 'roll', id: 'pawn' }, /"pawn" cannot be rolled/);
    const state = run(table(), { type: 'roll', id: 'dial' }, { type: 'roll', id: 'fate' });
    expect([1, 2, 3, 4, 5]).toContain(piece(state, 'dial').value);
    expect(['sword', 'shield', 'skull']).toContain(piece(state, 'fate').value);
    expect([1, 2, 3, 4, 5, 6]).toContain(piece(run(state, { type: 'roll', id: 'd6' }), 'd6').value);
  });

  it('keeps a value in its range, and a listed value one of the list', () => {
    expect(piece(run(table(), { type: 'setValue', id: 'dial', value: 9 }), 'dial').value).toBe(5);
    expect(piece(run(table(), { type: 'setValue', id: 'dial', value: -2 }), 'dial').value).toBe(1);
    const state = run(table(), { type: 'setValue', id: 'fate', value: 'skull' });
    expect(piece(state, 'fate').value).toBe('skull');
    refuses({ type: 'setValue', id: 'fate', value: 'axe' }, /"axe" is not one of the values/);
    refuses({ type: 'setValue', id: 'fate', value: 1 }, /not one of the values of "fate"/);
  });
});

describe('stacking', () => {
  it('lets two kinds share a stack when either lists the other', () => {
    for (const [ids, onto] of [
      [['chit'], 'tile'],
      [['tile'], 'chit'],
    ] as const) {
      const state = run(table(), { type: 'stack', ids: [...ids], onto });
      const pile = state.objects[piece(state, onto).parent!] as Stack;
      expect(pile.items).toEqual([onto, ids[0]]);
      expect(checkIntegrity(state)).toEqual([]);
    }
  });

  it('refuses kinds that do not stack together, and pieces that do not stack at all', () => {
    refuses({ type: 'stack', ids: ['coin'], onto: 'tile' }, /"tile" and "coin" cannot share/);
    refuses({ type: 'stack', ids: ['coin'], onto: 'pawn' }, /"pawn" cannot be stacked/);
    refuses({ type: 'stack', ids: ['coin', 'chit'], onto: 'tile' }, /cannot share a stack/);
  });

  it('stacks a component with itself', () => {
    const two = { ...table() };
    two.objects = { ...two.objects, 'coin.2': { ...piece(two, 'coin'), id: 'coin.2', z: 99 } };
    const state = run(two, { type: 'stack', ids: ['coin.2'], onto: 'coin' });
    expect(piece(state, 'coin.2').parent).toBe(piece(state, 'coin').parent);
  });
});

describe('zones', () => {
  it('cannot go into a hand', () => {
    refuses({ type: 'move', ids: ['area'], to: 'hand:ann' }, /"area" is a zone/);
  });

  it('are described and found by what they are', () => {
    const state = table();
    expect(describeTable(state, catalog)).toContain('area (zone)');
    expect(queryObjects(state, catalog, { is: 'zone' }).map((o) => o.id)).toEqual(['area']);
    expect(queryObjects(state, catalog, { is: 'die' }).map((o) => o.id)).toEqual([
      'd6',
      'fate',
      'omen',
    ]);
  });
});
