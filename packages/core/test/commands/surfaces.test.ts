import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../../src/commands/index.js';
import { TableEngine } from '../../src/engine.js';
import { snapFor } from '../../src/placement/snap.js';
import { createTable } from '../../src/setup.js';
import {
  checkIntegrity,
  fromTableFile,
  toTableFile,
  type Piece,
  type TableState,
} from '../../src/table/state.js';
import { objectsOn, surfacesOf, surfaceTarget } from '../../src/table/surfaces.js';
import { describeTable, queryObjects } from '../../src/views/describe.js';
import { examplePath } from '../paths.js';

let project: ResolvedProject;
let setUp: TableState;

beforeAll(async () => {
  const result = await loadProject(examplePath('harvest-moon'));
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
  setUp = createTable(project, { name: 'test', seed: 42 });
});

const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, project.types), state);
const fails = (state: TableState, command: Command) => () => run(state, command);
const piece = (s: TableState, id: string) => s.objects[id] as Piece;
const red: Command = { type: 'addSurface', id: 'red', name: 'Red player', seat: true };
const withRed = () => run(setUp, red);

describe('a table without surfaces', () => {
  it('has only the Centre, and saves no surfaces', () => {
    expect(surfacesOf(setUp)).toEqual([{ id: 'centre', name: 'Centre' }]);
    expect(toTableFile(setUp)).not.toHaveProperty('surfaces');
    expect(Object.values(setUp.objects).some((o) => o.surface)).toBe(false);
  });
});

describe('adding and changing surfaces', () => {
  it('adds surfaces in tile order', () => {
    const state = run(
      setUp,
      red,
      { type: 'addSurface', id: 'market', name: 'Market' },
      { type: 'addSurface', id: 'green', seat: true, after: 'red' },
      { type: 'addSurface', id: 'first', after: 'centre' },
    );
    expect(surfacesOf(state).map((s) => s.id)).toEqual([
      'centre',
      'first',
      'red',
      'green',
      'market',
    ]);
    expect(surfacesOf(state)[3]).toEqual({ id: 'green', name: 'green', seat: true });
  });

  it('renames the Centre, which stays first', () => {
    const state = run(withRed(), { type: 'editSurface', id: 'centre', name: 'Village' });
    expect(surfacesOf(state).map((s) => s.name)).toEqual(['Village', 'Red player']);
    expect(checkIntegrity(state)).toEqual([]);
  });

  it('moves a tile and turns a seat off, standing its player up', () => {
    const state = run(
      withRed(),
      { type: 'addSurface', id: 'blue' },
      { type: 'sit', surface: 'red', player: 'sam' },
      { type: 'editSurface', id: 'red', seat: false, after: 'blue' },
    );
    expect(surfacesOf(state).slice(1)).toEqual([
      { id: 'blue', name: 'blue' },
      { id: 'red', name: 'Red player' },
    ]);
  });

  it('colours a surface, the Centre too, and takes the colour off again', () => {
    const coloured = run(
      setUp,
      { ...red, color: ' red ' },
      { type: 'editSurface', id: 'centre', color: '#134034' },
    );
    expect(surfacesOf(coloured).map((s) => s.color)).toEqual(['#134034', 'red']);
    expect(toTableFile(coloured).surfaces?.[1]).toMatchObject({ color: 'red' });
    const plain = run(coloured, { type: 'editSurface', id: 'red', color: '' });
    expect(surfacesOf(plain)[1]).not.toHaveProperty('color');
  });

  it.each<[string, Command, string]>([
    ['a colour too long', { type: 'addSurface', id: 'x', color: 'x'.repeat(41) }, 'not a colour'],
    ['a bad id', { type: 'addSurface', id: 'Red Player' }, 'not a surface id'],
    ['a taken id', red, 'already a surface "red"'],
    ['the Centre again', { type: 'addSurface', id: 'centre' }, 'already a surface'],
    ['an empty name', { type: 'addSurface', id: 'x', name: '  ' }, 'needs a name'],
    ['an unknown place', { type: 'addSurface', id: 'x', after: 'nope' }, 'no surface "nope"'],
    ['seating the Centre', { type: 'editSurface', id: 'centre', seat: true }, 'only be renamed'],
    ['an unknown surface', { type: 'editSurface', id: 'nope', name: 'x' }, 'no surface "nope"'],
    ['removing the Centre', { type: 'removeSurface', id: 'centre' }, 'cannot be removed'],
  ])('refuses %s', (_, command, message) => {
    expect(fails(withRed(), command)).toThrow(message);
  });
});

describe('sitting at a seat', () => {
  it('seats a player and stands them up', () => {
    const seated = run(withRed(), { type: 'sit', surface: 'red', player: 'sam' });
    expect(surfacesOf(seated)[1]!.player).toBe('sam');
    const empty = run(seated, { type: 'sit', surface: 'red' });
    expect(surfacesOf(empty)[1]!.player).toBeUndefined();
  });

  it('refuses a surface that is no seat, a taken seat and a bad player id', () => {
    const state = run(withRed(), { type: 'addSurface', id: 'market' });
    expect(fails(state, { type: 'sit', surface: 'market', player: 'sam' })).toThrow('not a seat');
    const seated = run(state, { type: 'sit', surface: 'red', player: 'sam' });
    expect(fails(seated, { type: 'sit', surface: 'red', player: 'kim' })).toThrow(
      '"sam" already sits at "red"',
    );
    expect(fails(state, { type: 'sit', surface: 'red', player: 'Sam!' })).toThrow('no');
  });
});

describe('moving onto a surface', () => {
  it('moves to a position on another surface, keeping the group shape', () => {
    const state = run(withRed(), {
      type: 'move',
      ids: ['worker.red.1', 'worker.red.2'],
      to: [10, 20],
      surface: 'red',
    });
    expect(piece(state, 'worker.red.1')).toMatchObject({ surface: 'red', pos: [10, 20] });
    expect(piece(state, 'worker.red.2')).toMatchObject({ surface: 'red', pos: [36, 20] });
    // A plain move later keeps them where they are.
    const nudged = run(state, { type: 'move', ids: ['worker.red.1'], by: [1, 0] });
    expect(piece(nudged, 'worker.red.1')).toMatchObject({ surface: 'red', pos: [11, 20] });
    expect(checkIntegrity(nudged)).toEqual([]);
  });

  it('sends things to free room: the origin of an empty surface, then below what is there', () => {
    const once = run(withRed(), { type: 'move', ids: ['worker.red.1'], to: 'surface:red' });
    expect(piece(once, 'worker.red.1').pos).toEqual([0, 0]);
    const twice = run(once, { type: 'move', ids: ['worker.red.2'], to: 'surface:red' });
    const [x, y] = piece(twice, 'worker.red.2').pos;
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(10);
  });

  it('puts the Centre back by leaving "surface" out', () => {
    const away = run(withRed(), { type: 'move', ids: ['coins'], to: 'surface:red' });
    const back = run(away, { type: 'move', ids: ['coins'], to: [0, 300], surface: 'centre' });
    expect(piece(back, 'coins')).not.toHaveProperty('surface');
  });

  it('carries what is snapped on a board along with it', () => {
    const state = run(
      withRed(),
      { type: 'lock', ids: ['main-board'], locked: false },
      { type: 'move', ids: ['main-board'], to: 'surface:red' },
    );
    expect(piece(state, 'main-board').surface).toBe('red');
    expect(piece(state, 'coins')).toMatchObject({ surface: 'red', snap: 'main-board/supply' });
    expect(objectsOn(state, 'centre').every((o) => !o.snap)).toBe(true);
    expect(checkIntegrity(state)).toEqual([]);
  });

  it('lands on the surface of the board whose drop area it goes to', () => {
    const state = run(
      withRed(),
      { type: 'lock', ids: ['main-board'], locked: false },
      { type: 'move', ids: ['main-board'], to: 'surface:red' },
      { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields' },
    );
    expect(piece(state, 'worker.red.1').surface).toBe('red');
  });

  it('draws cards onto a surface, a pile of several as one stack there', () => {
    const one = run(withRed(), { type: 'draw', from: 'deck:actions', to: [0, 0], surface: 'red' });
    const drawn = Object.values(one.objects).find((o) => o.surface === 'red')!;
    expect(drawn.kind).toBe('piece');
    const three = run(withRed(), {
      type: 'draw',
      from: 'deck:actions',
      count: 3,
      to: 'surface:red',
    });
    const [pile] = objectsOn(three, 'red');
    expect(pile).toMatchObject({ kind: 'stack', surface: 'red' });
    expect(checkIntegrity(three)).toEqual([]);
  });

  it('deals to positions on a surface and takes a card onto one', () => {
    const dealt = run(withRed(), {
      type: 'deal',
      from: 'deck:actions',
      to: [
        [0, 0],
        [80, 0],
      ],
      surface: 'red',
    });
    expect(objectsOn(dealt, 'red')).toHaveLength(2);
    const card = (setUp.objects['deck:actions'] as { items: string[] }).items[0]!;
    const taken = run(withRed(), { type: 'take', id: card, to: [5, 5], surface: 'red' });
    expect(piece(taken, card)).toMatchObject({ surface: 'red', pos: [5, 5] });
  });

  it('leaves the surface behind in a hand, and plays from the hand onto one', () => {
    const held = run(
      withRed(),
      { type: 'move', ids: ['worker.red.1'], to: [0, 0], surface: 'red' },
      { type: 'move', ids: ['worker.red.1'], to: 'hand:sam' },
    );
    expect(piece(held, 'worker.red.1')).not.toHaveProperty('surface');
    const played = run(held, {
      type: 'move',
      ids: ['worker.red.1'],
      to: [3, 4],
      surface: 'red',
    });
    expect(piece(played, 'worker.red.1')).toMatchObject({ surface: 'red', pos: [3, 4] });
  });

  it.each<[string, Command, string]>([
    [
      'a surface with an offset',
      { type: 'move', ids: ['coins'], by: [1, 1], surface: 'red' },
      'only with a position',
    ],
    [
      'a surface with a drop area',
      { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields', surface: 'red' },
      'only with a position',
    ],
    [
      'an unknown surface',
      { type: 'move', ids: ['coins'], to: [0, 0], surface: 'nope' },
      'no surface "nope"',
    ],
    [
      'free room on an unknown surface',
      { type: 'move', ids: ['coins'], to: 'surface:x' },
      'no surface "x"',
    ],
    [
      'a drop area on another surface than the one given',
      {
        type: 'move',
        ids: ['worker.red.1'],
        to: [0, 0],
        into: 'main-board/supply',
        surface: 'red',
      },
      'on another surface',
    ],
    [
      'a surface with a hand',
      { type: 'draw', from: 'deck:actions', to: 'hand:sam', surface: 'red' },
      'already says where',
    ],
    ['a locked board', { type: 'move', ids: ['main-board'], to: 'surface:red' }, 'is locked'],
  ])('refuses %s', (_, command, message) => {
    expect(fails(withRed(), command)).toThrow(message);
  });
});

describe('removing a surface', () => {
  it('removes an empty surface', () => {
    expect(surfacesOf(run(withRed(), { type: 'removeSurface', id: 'red' }))).toHaveLength(1);
  });

  it('moves what lies on it to another surface first', () => {
    const state = run(
      withRed(),
      { type: 'move', ids: ['worker.red.1', 'worker.red.2'], to: [0, 0], surface: 'red' },
      { type: 'removeSurface', id: 'red', to: 'centre' },
    );
    expect(surfacesOf(state)).toHaveLength(1);
    expect(piece(state, 'worker.red.1')).not.toHaveProperty('surface');
    expect(state).not.toHaveProperty('surfaces');
    expect(checkIntegrity(state)).toEqual([]);
  });

  it('refuses to drop what lies on it', () => {
    const state = run(withRed(), { type: 'move', ids: ['coins'], to: 'surface:red' });
    expect(fails(state, { type: 'removeSurface', id: 'red' })).toThrow('has things on it');
    expect(fails(state, { type: 'removeSurface', id: 'red', to: 'red' })).toThrow('being removed');
  });
});

describe('undoing surface changes', () => {
  it('undoes and redoes adding a surface and sitting', () => {
    const engine = new TableEngine(setUp, project.types);
    engine.dispatch(red, 'sam');
    engine.dispatch({ type: 'sit', surface: 'red', player: 'sam' }, 'sam');
    engine.undo('sam');
    expect(surfacesOf(engine.state)[1]!.player).toBeUndefined();
    engine.undo('sam');
    expect(engine.state.surfaces).toBeUndefined();
    engine.redo('sam');
    expect(surfacesOf(engine.state)).toHaveLength(2);
  });

  it('refuses to undo a surface change someone changed since', () => {
    const engine = new TableEngine(setUp, project.types);
    engine.dispatch(red, 'sam');
    engine.dispatch({ type: 'move', ids: ['coins'], by: [1, 0] }, 'kim');
    expect(engine.canUndoFor('sam')).toBe(true);
    engine.dispatch({ type: 'editSurface', id: 'red', name: 'Rouge' }, 'kim');
    expect(engine.canUndoFor('sam')).toBe(false);
    expect(() => engine.undo('sam')).toThrow('changed those pieces since');
  });

  it("undoes another player's move onto a surface without touching the list", () => {
    const engine = new TableEngine(withRed(), project.types);
    engine.dispatch({ type: 'move', ids: ['coins'], to: 'surface:red' }, 'sam');
    engine.dispatch({ type: 'addSurface', id: 'blue' }, 'kim');
    engine.undo('sam');
    expect(piece(engine.state, 'coins')).not.toHaveProperty('surface');
    expect(surfacesOf(engine.state)).toHaveLength(3);
  });
});

describe('saved tables with surfaces', () => {
  it('saves and reads back surfaces and where things lie', () => {
    const state = run(withRed(), { type: 'move', ids: ['coins'], to: 'surface:red' });
    const file = toTableFile(state);
    expect(file.surfaces).toEqual([{ id: 'red', name: 'Red player', seat: true }]);
    expect(fromTableFile(JSON.parse(JSON.stringify(file)))).toEqual(state);
  });

  it.each<[string, (file: ReturnType<typeof toTableFile>) => void, string]>([
    [
      'an unknown surface',
      (f) =>
        Object.assign(
          f.objects.find((o) => o.id === 'worker.red.1')!,
          { surface: 'nope' },
        ),
      'unknown surface "nope"',
    ],
    [
      'the Centre named',
      (f) =>
        Object.assign(
          f.objects.find((o) => o.id === 'worker.red.1')!,
          { surface: 'centre' },
        ),
      'leave "surface" out',
    ],
    [
      'a surface inside a stack',
      (f) =>
        Object.assign(
          f.objects.find((o) => o.kind === 'piece' && o.parent)!,
          { surface: 'red' },
        ),
      'lies on no surface',
    ],
    [
      'a rider on another surface than its board',
      (f) =>
        Object.assign(
          f.objects.find((o) => o.id === 'd6.1')!,
          { surface: 'red' },
        ),
      'sits on "main-board" but lies on another surface',
    ],
    [
      'a surface listed twice',
      (f) => f.surfaces!.push({ id: 'red', name: 'Again' }),
      'listed twice',
    ],
    ['the Centre listed later', (f) => f.surfaces!.push({ id: 'centre', name: 'C' }), 'come first'],
    [
      'a seated player on a surface that is no seat',
      (f) => f.surfaces!.push({ id: 'market', name: 'Market', player: 'sam' }),
      'which is not a seat',
    ],
  ])('refuses %s', (_, spoil, message) => {
    const file = JSON.parse(JSON.stringify(toTableFile(withRed()))) as ReturnType<
      typeof toTableFile
    >;
    spoil(file);
    expect(() => fromTableFile(file)).toThrow(message);
  });
});

describe('looking at surfaces', () => {
  it('snaps only to drop areas on the surface of the drop', () => {
    const type = project.types.worker;
    const point = piece(setUp, 'coins').pos;
    const drop = { type, point, radius: 40 };
    expect(snapFor(setUp, project.types, { ...drop, surface: 'centre' })).toBeDefined();
    expect(snapFor(setUp, project.types, { ...drop, surface: 'red' })).toBeUndefined();
  });

  it('lists surfaces and says which one an object lies on', () => {
    const state = run(
      withRed(),
      { type: 'sit', surface: 'red', player: 'sam' },
      { type: 'move', ids: ['worker.red.1'], to: [0, 0], surface: 'red' },
    );
    const text = describeTable(state, project.types);
    expect(text).toContain('- red: Red player, seat, sam sits here, 1 objects');
    expect(text).toContain('- worker.red.1: ');
    expect(text).toContain('at [0, 0] on red');
    expect(text).toContain('On red: 1 objects');
    const only = describeTable(state, project.types, { surface: 'red' });
    expect(only).not.toContain('coins');
    expect(only).not.toContain('Snap targets');
    expect(() => describeTable(state, project.types, { surface: 'nope' })).toThrow('no surface');
    const found = queryObjects(state, project.types, { surface: 'red' });
    expect(found.map((o) => [o.id, o.surface])).toEqual([['worker.red.1', 'red']]);
  });

  it('reads surface targets', () => {
    expect(surfaceTarget('surface:red')).toBe('red');
    expect(surfaceTarget('hand:red')).toBeUndefined();
    expect(surfaceTarget([0, 0])).toBeUndefined();
  });
});
