import type { Stack, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  doubleClickCommand,
  drawCommands,
  fromStack,
  handDropCommands,
  inBox,
  moveCommands,
  snapHint,
  type Vec,
} from './drops';
import { topLevel } from './render/geometry';
import { after, exampleTable } from './testing';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

const types = () => project.types;
const move = (moved: string[], by: Vec, hand?: string) =>
  moveCommands(table, types(), { moved, lead: moved[0]!, by, ignore: new Set(moved), hand });
const deck = () => table.objects['deck:actions'] as Stack;

describe('moveCommands', () => {
  it('snaps a piece dropped near a spot that accepts it into the spot', () => {
    // worker.red.1 starts at [-270, 240]; fields/0 is at [-190, 0].
    expect(move(['worker.red.1'], [78, -238])).toEqual([
      { type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/0' },
    ]);
  });

  it('shifts pieces dropped away from any spot', () => {
    expect(move(['worker.red.1'], [0, 100])).toEqual([
      { type: 'move', ids: ['worker.red.1'], by: [0, 100] },
    ]);
  });

  it('records the free area a group lands in, but does not snap a group into spots', () => {
    // The supply area is centred on [210, 50].
    expect(move(['worker.red.1', 'worker.red.2'], [480, -190])).toEqual([
      {
        type: 'move',
        ids: ['worker.red.1', 'worker.red.2'],
        by: [480, -190],
        into: 'main-board/supply',
      },
    ]);
    expect(move(['worker.red.1', 'worker.red.2'], [78, -238])).toEqual([
      { type: 'move', ids: ['worker.red.1', 'worker.red.2'], by: [78, -238] },
    ]);
  });

  it('stacks cards dropped on a pile of cards', () => {
    // The raid card lies at [-215, -130], the deck at [350, -130].
    expect(move(['action-card.raid.1'], [565, 0])).toEqual([
      { type: 'stack', ids: ['action-card.raid.1'], onto: 'deck:actions' },
    ]);
  });

  it('puts what was picked up into the hand, bottom first', () => {
    expect(move(['action-card.harvest.1', 'action-card.raid.1'], [0, 0], 'alice')).toEqual([
      { type: 'move', ids: ['action-card.raid.1', 'action-card.harvest.1'], to: 'hand:alice' },
    ]);
  });
});

describe('drawCommands', () => {
  const draw = (piece: string, local: Vec, hand?: string, on = table) =>
    drawCommands(on, types(), { stack: on.objects['deck:actions'] as Stack, piece, local, hand });
  const top = () => deck().items.at(-1)!;

  it('draws the top card to where it is dropped, and selects it', () => {
    expect(draw(top(), [0, 300])).toEqual({
      commands: [{ type: 'draw', from: 'deck:actions', to: [350, 170] }],
      select: top(),
    });
  });

  it('draws into the hand', () => {
    expect(draw(top(), [0, 300], 'alice')).toEqual({
      commands: [{ type: 'draw', from: 'deck:actions', to: 'hand:alice' }],
    });
  });

  it('stacks the card on another pile it is dropped on', () => {
    expect(draw(top(), [-565, 0]).commands).toEqual([
      { type: 'draw', from: 'deck:actions', to: [-215, -130] },
      { type: 'stack', ids: [top()], onto: 'action-card.raid.1' },
    ]);
  });

  it('records the area a drawn card lands in, so the area settles it straight away', () => {
    // The supply area is centred on [210, 50].
    expect(draw(top(), [-140, 180]).commands).toEqual([
      { type: 'draw', from: 'deck:actions', to: [210, 50] },
      { type: 'move', ids: [top()], by: [0, 0], into: 'main-board/supply' },
    ]);
  });

  it('takes any card out of a fanned pile', () => {
    const fanned = after(project, table, { type: 'layout', id: 'deck:actions', layout: 'fan' });
    const first = deck().items[0]!;
    expect(draw(first, [0, 300], undefined, fanned).commands).toEqual([
      { type: 'take', id: first, to: [350, 170] },
    ]);
  });
});

describe('handDropCommands', () => {
  let held: TableState;
  beforeAll(() => {
    held = after(project, table, {
      type: 'move',
      ids: ['action-card.raid.1'],
      to: 'hand:alice',
    });
  });
  const play = (point: Vec, faceDown = false) =>
    handDropCommands(held, types(), { id: 'action-card.raid.1', point, faceDown });

  it('plays a card onto the table where it is dropped, to a tenth of a millimetre', () => {
    expect(play([10.04, 300.06])).toEqual([
      { type: 'move', ids: ['action-card.raid.1'], to: [10, 300.1] },
    ]);
    expect(play([10, 300], true)).toEqual([
      { type: 'move', ids: ['action-card.raid.1'], to: [10, 300], face: 'down' },
    ]);
  });

  it('records the area a card is played into', () => {
    expect(play([210, 50])).toEqual([
      { type: 'move', ids: ['action-card.raid.1'], to: [210, 50] },
      { type: 'move', ids: ['action-card.raid.1'], by: [0, 0], into: 'main-board/supply' },
    ]);
  });

  it('stacks a card played onto a pile, face down by playing it there first', () => {
    expect(play([350, -130])).toEqual([
      { type: 'stack', ids: ['action-card.raid.1'], onto: 'deck:actions' },
    ]);
    expect(play([350, -130], true)).toEqual([
      { type: 'move', ids: ['action-card.raid.1'], to: [350, -130], face: 'down' },
      { type: 'stack', ids: ['action-card.raid.1'], onto: 'deck:actions' },
    ]);
  });

  it('snaps a played card into a free spot near the drop', () => {
    expect(play([-215, -125])[0]).toMatchObject({ to: 'main-board/market/0' });
  });

  it('ignores anything that is not a piece', () => {
    expect(
      handDropCommands(held, types(), { id: 'deck:actions', point: [0, 0], faceDown: false }),
    ).toEqual([]);
  });
});

describe('doubleClickCommand', () => {
  const on = (id: string, on = types()) => doubleClickCommand(table, on, table.objects[id]!);

  it('rolls dice and flips anything flippable, a pile by its top card', () => {
    expect(on('d6.1')).toEqual({ type: 'roll', id: 'd6.1' });
    expect(on('action-card.raid.1')).toEqual({ type: 'flip', ids: ['action-card.raid.1'] });
    expect(on('score-marker.red')).toEqual({ type: 'flip', ids: ['score-marker.red'] });
    expect(on('deck:actions')).toEqual({ type: 'flip', ids: ['deck:actions'] });
    expect(on('worker.red.1')).toBeUndefined();
    expect(on('coins')).toBeUndefined();
  });

  it('leaves locked objects alone', () => {
    const locked = { ...table.objects['d6.1']!, locked: true };
    expect(doubleClickCommand(table, types(), locked)).toBeUndefined();
  });

  it('rolls whatever has the roll control, and flips a die without it', () => {
    const coins = project.types.coins!;
    const rolling = { ...types(), coins: { ...coins, values: { controls: ['roll' as const] } } };
    expect(on('coins', rolling)).toEqual({ type: 'roll', id: 'coins' });
    const d6 = project.types.d6!;
    const stepped = {
      ...types(),
      d6: { ...d6, flippable: true as const, values: { controls: ['step' as const] } },
    };
    expect(on('d6.1', stepped)).toEqual({ type: 'flip', ids: ['d6.1'] });
  });
});

describe('inBox', () => {
  it('finds the unlocked objects centred inside a box drawn either way', () => {
    // The red workers stand at y 240, x -270 to -166; the board, locked, at the origin.
    const objects = topLevel(table);
    expect(inBox(objects, [-280, 230], [-180, 250])).toEqual([
      'worker.red.1',
      'worker.red.2',
      'worker.red.3',
      'worker.red.4',
    ]);
    expect(inBox(objects, [-180, 250], [-280, 230])).toHaveLength(4);
    expect(inBox(objects, [-10, -10], [10, 10])).toEqual([]);
  });
});

describe('fromStack', () => {
  it('turns a position inside a rotated stack into a table position', () => {
    const stack = { ...deck(), pos: [100, 50], rot: 90 } as Stack;
    const [x, y] = fromStack(stack, [10, 0]);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(60);
  });
});

describe('snapHint', () => {
  it('shows the spots that accept the dragged piece, sized like it', () => {
    const hint = snapHint(table, types(), table.objects['worker.red.1']!, new Set());
    expect(hint!.spots.map((s) => s.ref)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `main-board/fields/${i}`),
      'main-board/supply',
    ]);
    expect(hint!.size).toEqual([16, 16]);
  });

  it('shows nothing while the board itself moves', () => {
    expect(
      snapHint(table, types(), table.objects['worker.red.1']!, new Set(['main-board'])),
    ).toBeUndefined();
  });
});
