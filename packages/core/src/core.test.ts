import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCommand, CommandError } from './commands.js';
import { TableEngine } from './engine.js';
import { shuffled } from './rng.js';
import { createTable } from './setup.js';
import {
  checkIntegrity,
  fromTableFile,
  toTableFile,
  type Piece,
  type Stack,
  type TableState,
} from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
});

const fresh = () => createTable(project, { name: 'test', seed: 42, setup: false });
const engine = () => new TableEngine(fresh(), project.types);
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const stack = (s: TableState, id: string) => s.objects[id] as Stack;
const DECK = 'deck:actions';

describe('createTable', () => {
  it('spawns every component, with decks as face-down stacks', () => {
    table = fresh();
    const pieces = Object.values(table.objects).filter((o) => o.kind === 'piece');
    expect(pieces).toHaveLength(26);
    expect(stack(table, DECK).items).toHaveLength(10);
    expect(piece(table, 'action-card.harvest.1')).toMatchObject({ face: 'down', parent: DECK });
    expect(piece(table, 'main-board').locked).toBe(true);
    expect(piece(table, 'coins').value).toBe(0);
    expect(piece(table, 'd6.1').value).toBe(1);
    expect(checkIntegrity(table)).toEqual([]);
  });

  it('puts the first card listed on top of the deck', () => {
    expect(stack(fresh(), DECK).items.at(-1)).toBe('action-card.harvest.1');
  });
});

describe('commands', () => {
  it('moves objects to a point, keeping their relative positions and raising them', () => {
    const s0 = fresh();
    const a = piece(s0, 'worker.red.1');
    const b = piece(s0, 'worker.red.2');
    const s1 = applyCommand(s0, { type: 'move', ids: [a.id, b.id], to: [500, 500] }, project.types);
    expect(piece(s1, a.id).pos).toEqual([500, 500]);
    expect(piece(s1, b.id).pos).toEqual([500 + b.pos[0] - a.pos[0], 500 + b.pos[1] - a.pos[1]]);
    expect(piece(s1, b.id).z).toBeGreaterThan(stack(s1, DECK).z);
    expect(piece(s0, a.id).pos).toEqual(a.pos); // input untouched
  });

  it('refuses to move locked objects or pieces inside a stack', () => {
    const s = fresh();
    expect(() =>
      applyCommand(s, { type: 'move', ids: ['main-board'], by: [1, 1] }, project.types),
    ).toThrow(/locked/);
    expect(() =>
      applyCommand(s, { type: 'move', ids: ['action-card.raid.1'], by: [1, 1] }, project.types),
    ).toThrow(/inside stack/);
  });

  it('flips a single piece, and flips a whole stack by reversing it', () => {
    const e = engine();
    const before = stack(e.state, DECK).items;
    e.dispatch({ type: 'flip', ids: [DECK] });
    expect(stack(e.state, DECK).items).toEqual([...before].reverse());
    expect(piece(e.state, before[0]!).face).toBe('up');
    expect(() => e.dispatch({ type: 'flip', ids: ['worker.red.1'] })).toThrow(/only one side/);
  });

  it('rotates by steps and by degrees, wrapping at 360', () => {
    const e = engine();
    e.dispatch({ type: 'rotate', ids: ['score-marker.red'], steps: -1 });
    expect(piece(e.state, 'score-marker.red').rot).toBe(270);
    e.dispatch({ type: 'rotate', ids: ['score-marker.red'], degrees: 135 });
    expect(piece(e.state, 'score-marker.red').rot).toBe(45);
  });

  it('draws one card, then several as a new stack', () => {
    const e = engine();
    const top = stack(e.state, DECK).items.at(-1)!;
    e.dispatch({ type: 'draw', from: DECK, to: [100, 100], face: 'up' });
    expect(piece(e.state, top)).toMatchObject({ pos: [100, 100], face: 'up' });
    expect(piece(e.state, top).parent).toBeUndefined();
    expect(stack(e.state, DECK).items).toHaveLength(9);

    e.dispatch({ type: 'draw', from: DECK, count: 3, to: [200, 100] });
    const pile = Object.values(e.state.objects).find(
      (o) => o.kind === 'stack' && o.id !== DECK,
    ) as Stack;
    expect(pile.items).toHaveLength(3);
    expect(stack(e.state, DECK).items).toHaveLength(6);
    expect(checkIntegrity(e.state)).toEqual([]);
  });

  it('dissolves a stack when its last-but-one card is drawn', () => {
    const e = engine();
    e.dispatch({ type: 'draw', from: DECK, count: 9, to: [0, 300] });
    expect(e.state.objects[DECK]).toBeUndefined();
    const last = Object.values(e.state.objects).find(
      (o) => o.kind === 'piece' && o.type === 'action-card' && !o.parent,
    ) as Piece;
    expect(last.pos).toEqual(stack(fresh(), DECK).pos);
    expect(checkIntegrity(e.state)).toEqual([]);
  });

  it('stacks pieces onto a piece and merges stacks', () => {
    const e = engine();
    e.dispatch({ type: 'draw', from: DECK, count: 2, to: [0, 300] });
    const [a, b] = Object.values(e.state.objects).filter(
      (o) => o.kind === 'piece' && o.type === 'action-card' && o.parent && o.parent !== DECK,
    ) as Piece[];
    expect(a && b).toBeTruthy();
    e.dispatch({ type: 'draw', from: DECK, to: [400, 300] });
    const single = Object.values(e.state.objects).find(
      (o) => o.kind === 'piece' && o.type === 'action-card' && !o.parent,
    )!;
    e.dispatch({ type: 'stack', ids: [a!.parent!], onto: single.id });
    const merged = stack(e.state, piece(e.state, single.id).parent!);
    expect(merged.items).toHaveLength(3);
    expect(merged.items[0]).toBe(single.id);
    expect(checkIntegrity(e.state)).toEqual([]);
    expect(() => e.dispatch({ type: 'stack', ids: ['worker.red.1'], onto: merged.id })).toThrow(
      /cannot be stacked/,
    );
  });

  it('shuffles deterministically from the table seed', () => {
    const a = engine();
    const b = engine();
    a.dispatch({ type: 'shuffle', id: DECK });
    b.dispatch({ type: 'shuffle', id: DECK });
    expect(stack(a.state, DECK).items).toEqual(stack(b.state, DECK).items);
    expect(stack(a.state, DECK).items).not.toEqual(stack(fresh(), DECK).items);
    expect(a.state.rng).not.toBe(fresh().rng);
  });

  it('rolls dice and clamps counters', () => {
    const e = engine();
    e.dispatch({ type: 'roll', id: 'd6.1' });
    expect([1, 2, 3, 4, 5, 6]).toContain(piece(e.state, 'd6.1').value);
    e.dispatch({ type: 'setValue', id: 'coins', value: 250 });
    expect(piece(e.state, 'coins').value).toBe(99);
    expect(() => e.dispatch({ type: 'setValue', id: 'd6.1', value: 7 })).toThrow(CommandError);
    expect(() => e.dispatch({ type: 'roll', id: 'coins' })).toThrow(/not a die/);
  });

  it('locks and unlocks', () => {
    const e = engine();
    e.dispatch({ type: 'lock', ids: ['main-board'], locked: false });
    expect(piece(e.state, 'main-board').locked).toBeUndefined();
    e.dispatch({ type: 'move', ids: ['main-board'], by: [10, 0] });
  });
});

describe('TableEngine', () => {
  it('undoes and redoes, and a new command clears redo', () => {
    const e = engine();
    const s0 = e.state;
    e.dispatch({ type: 'move', ids: ['worker.red.1'], by: [5, 5] });
    const s1 = e.state;
    e.dispatch({ type: 'shuffle', id: DECK });
    expect(e.undo()).toBe(true);
    expect(e.state).toBe(s1);
    expect(e.undo()).toBe(true);
    expect(e.state).toBe(s0);
    expect(e.undo()).toBe(false);
    expect(e.redo()).toBe(true);
    expect(e.state).toBe(s1);
    e.dispatch({ type: 'flip', ids: [DECK] });
    expect(e.canRedo).toBe(false);
    expect(e.history.map((c) => c.type)).toEqual(['move', 'flip']);
  });

  it('leaves state unchanged when a command fails', () => {
    const e = engine();
    const s0 = e.state;
    expect(() => e.dispatch({ type: 'draw', from: DECK, count: 50, to: [0, 0] })).toThrow(
      /cannot draw 50/,
    );
    expect(e.state).toBe(s0);
    expect(e.canUndo).toBe(false);
  });

  it('notifies subscribers', () => {
    const e = engine();
    const kinds: string[] = [];
    e.subscribe((_s, change) => kinds.push(`${change.kind}:${change.command.type}`));
    e.dispatch({ type: 'roll', id: 'd6.2' });
    e.undo();
    expect(kinds).toEqual(['apply:roll', 'undo:roll']);
  });
});

describe('table files', () => {
  it('round-trips through JSON', () => {
    const e = engine();
    e.dispatch({ type: 'shuffle', id: DECK });
    e.dispatch({ type: 'draw', from: DECK, count: 2, to: [10, 10] });
    const json = JSON.parse(JSON.stringify(toTableFile(e.state)));
    expect(fromTableFile(json)).toEqual(e.state);
  });

  it('rejects malformed and inconsistent files', () => {
    expect(() => fromTableFile({ format: 'trayful/1', table: 't', seed: 1 })).toThrow(/objects/);
    const file = toTableFile(fresh());
    const broken = {
      ...file,
      objects: file.objects.map((o) =>
        o.id === 'action-card.raid.1' ? { ...o, parent: undefined } : o,
      ),
    };
    expect(() => fromTableFile(JSON.parse(JSON.stringify(broken)))).toThrow(
      /does not have|parent is "none"/,
    );
  });
});

describe('rng', () => {
  it('shuffles reproducibly and keeps every item', () => {
    const [a] = shuffled([1, 2, 3, 4, 5, 6, 7, 8], 7);
    const [b] = shuffled([1, 2, 3, 4, 5, 6, 7, 8], 7);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
