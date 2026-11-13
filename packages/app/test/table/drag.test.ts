import type { ClientMessage, Command, Stack, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import Konva from 'konva';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableDrag } from '../../src/table/drag';
import { useStore } from '../../src/store';
import { after, exampleTable } from '../helpers';

let project: ResolvedProject;
let table: TableState;
let sent: Command[];
const initial = useStore.getState();

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

/** Puts a table on screen, with the commands the page sends collected in `sent`. */
function show(on: TableState) {
  sent = [];
  const send = (message: ClientMessage) => {
    if (message.type === 'command') sent.push(message.command);
  };
  useStore.setState(
    {
      ...initial,
      table: { ...on, hands: {}, bags: {} },
      view: { types: project.types } as never,
      send,
    },
    true,
  );
}

beforeEach(() => show(table));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A drag with a canvas node for each named object, placed where the table has it. */
function dragOn(on: TableState, ...ids: string[]) {
  const drag = new TableDrag();
  for (const id of ids) {
    const [x, y] = on.objects[id]!.pos;
    drag.nodes.set(id, new Konva.Group({ x, y }));
  }
  return drag;
}

const node = (drag: TableDrag, id: string) => drag.nodes.get(id)!;

/** Moves an object's node by some amount, as Konva does during a drag. */
function pull(drag: TableDrag, id: string, by: [number, number]) {
  const n = node(drag, id);
  n.position({ x: n.x() + by[0], y: n.y() + by[1] });
  drag.move(id, n);
}

/** Makes the pointer of every drag lie over the hand tray, as `alice`. */
function pointerOverHand() {
  useStore.setState({ me: { player: { id: 'alice' } } as never });
  vi.stubGlobal('document', {
    elementFromPoint: () => null,
    querySelector: () => ({
      getBoundingClientRect: () => ({ left: 0, right: 100, top: 0, bottom: 100 }),
    }),
  });
  pointerAt(10, 10);
}

/**
 * Puts the pointer of every drag at a point of the page, the canvas starting at its
 * corner and reaching as far as `size`.
 */
function pointerAt(x: number, y: number, size = 1000) {
  const canvas = { left: 0, top: 0, right: size, bottom: size };
  const stage = {
    batchDraw: () => undefined,
    getPointerPosition: () => ({ x, y }),
    container: () => ({ getBoundingClientRect: () => canvas }),
    scaleX: () => 1,
  };
  vi.spyOn(Konva.Group.prototype, 'getStage').mockReturnValue(stage as never);
}

/**
 * Makes the pointer of every drag lie over another surface: at [300, 200] of the
 * page on its tile, which starts at [100, 100], or on its chip.
 */
function pointerOverSurface(surface: string, part: 'tile' | 'chip') {
  const element = {
    dataset: part === 'tile' ? { surface } : { chip: surface },
    getBoundingClientRect: () => ({ left: 100, top: 100 }),
  };
  const wanted = part === 'tile' ? 'surface' : 'chip';
  const closest = (selector: string) => (selector.includes(wanted) ? element : null);
  copies = [];
  const createElement = () => {
    const copy = { style: {}, getContext: () => null, removed: false };
    copies.push(copy);
    return Object.assign(copy, { remove: () => (copy.removed = true) });
  };
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', {
    elementFromPoint: () => ({ closest }),
    querySelector: () => null,
    createElement,
    body: { append: () => undefined },
  });
  vi.spyOn(Konva.Group.prototype, 'toCanvas').mockReturnValue({} as never);
  // The canvas the drag starts on ends left of the other tile, or holds the pointer.
  pointerAt(300, 200, surface === 'centre' ? 1000 : 100);
}

/** The copies of dragged pieces put on the page by the last `pointerOverSurface`. */
let copies: { removed: boolean }[] = [];

describe('dragging objects', () => {
  it('selects what is picked up and shows the spots it could snap to', () => {
    const drag = dragOn(table, 'worker.red.1');
    drag.start('worker.red.1');
    expect(useStore.getState().selection).toEqual(['worker.red.1']);
    expect(useStore.getState().snapHint?.spots.length).toBeGreaterThan(0);
  });

  it('lights up the spot under the piece and sends a move into it on the drop', () => {
    // worker.red.1 starts at [-270, 240]; fields/0 is at [-190, 0].
    const drag = dragOn(table, 'worker.red.1');
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [78, -238]);
    expect(useStore.getState().snapHint?.active).toBe('main-board/fields/0');
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([{ type: 'move', ids: ['worker.red.1'], to: 'main-board/fields/0' }]);
    expect(useStore.getState().snapHint).toBeUndefined();
  });

  it('moves the rest of the selection along with the piece being dragged', () => {
    useStore.getState().select(['worker.red.1', 'worker.red.2']);
    const drag = dragOn(table, 'worker.red.1', 'worker.red.2');
    const [x, y] = table.objects['worker.red.2']!.pos;
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [0, 100]);
    expect(node(drag, 'worker.red.2').position()).toEqual({ x, y: y + 100 });
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([{ type: 'move', ids: ['worker.red.1', 'worker.red.2'], by: [0, 100] }]);
  });

  it('carries the pieces snapped onto a board when the board moves', () => {
    const placed = after(project, table, {
      type: 'move',
      ids: ['worker.red.1'],
      to: 'main-board/fields/0',
    });
    show(placed);
    const drag = dragOn(placed, 'main-board', 'worker.red.1');
    const [x, y] = placed.objects['worker.red.1']!.pos;
    drag.start('main-board');
    pull(drag, 'main-board', [20, 10]);
    expect(node(drag, 'worker.red.1').position()).toEqual({ x: x + 20, y: y + 10 });
  });

  it('puts everything back and sends nothing when the drag was only a click', () => {
    useStore.getState().select(['worker.red.1', 'worker.red.2']);
    const drag = dragOn(table, 'worker.red.1', 'worker.red.2');
    const [x, y] = table.objects['worker.red.2']!.pos;
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [0.3, 0.3]);
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([]);
    expect(node(drag, 'worker.red.2').position()).toEqual({ x, y });
  });

  it('lights up the hand tray and drops into the hand when let go over it', () => {
    pointerOverHand();
    const drag = dragOn(table, 'action-card.raid.1');
    drag.start('action-card.raid.1');
    pull(drag, 'action-card.raid.1', [0, 300]);
    expect(useStore.getState().overHand).toBe(true);
    expect(useStore.getState().snapHint?.active).toBeUndefined();
    drag.end('action-card.raid.1', node(drag, 'action-card.raid.1'));
    expect(sent).toEqual([{ type: 'move', ids: ['action-card.raid.1'], to: 'hand:alice' }]);
    expect(useStore.getState().overHand).toBe(false);
  });

  it('ignores a drag it never saw start', () => {
    const drag = dragOn(table, 'worker.red.1');
    pull(drag, 'worker.red.1', [0, 100]);
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([]);
  });
});

describe('drawing cards off a stack', () => {
  const deck = () => table.objects['deck:actions'] as Stack;
  const top = () => deck().items.at(-1)!;
  const home: [number, number] = [0, 0];
  const card = (x: number, y: number) => new Konva.Group({ x, y });

  it('clears the selection and shows where the card could go', () => {
    useStore.getState().select(['worker.red.1']);
    new TableDrag().drawStart(deck());
    expect(useStore.getState().selection).toEqual([]);
    expect(useStore.getState().snapHint?.spots.length).toBeGreaterThan(0);
  });

  it('draws the card to where it is dropped and selects it', () => {
    const drag = new TableDrag();
    drag.drawStart(deck());
    drag.drawMove(deck(), card(0, 300));
    drag.drawEnd(deck(), top(), card(0, 300), home);
    expect(sent).toEqual([{ type: 'draw', from: 'deck:actions', to: [350, 170] }]);
    expect(useStore.getState().selection).toEqual([top()]);
  });

  it('lights up the area a card is drawn over', () => {
    // The supply area is centred on [210, 50]; the deck lies at [350, -130].
    const drag = new TableDrag();
    drag.drawStart(deck());
    drag.drawMove(deck(), card(-140, 180));
    expect(useStore.getState().snapHint?.active).toBe('main-board/supply');
  });

  it('selects the stack on a click, and toggles it with shift held', () => {
    const drag = new TableDrag();
    drag.drawEnd(deck(), top(), card(0.2, 0), home);
    expect(sent).toEqual([]);
    expect(useStore.getState().selection).toEqual(['deck:actions']);
    useStore.setState({ shiftDown: true });
    drag.drawEnd(deck(), top(), card(0.2, 0), home);
    expect(useStore.getState().selection).toEqual([]);
  });

  it('draws into the hand when let go over the hand tray', () => {
    pointerOverHand();
    const drag = new TableDrag();
    drag.drawStart(deck());
    drag.drawMove(deck(), card(0, 300));
    expect(useStore.getState().overHand).toBe(true);
    drag.drawEnd(deck(), top(), card(0, 300), home);
    expect(sent).toEqual([{ type: 'draw', from: 'deck:actions', to: 'hand:alice' }]);
  });
});

describe('dragging to another surface', () => {
  let split: TableState;
  beforeEach(() => {
    split = after(project, table, { type: 'addSurface', id: 'side' });
    show(split);
    useStore.setState({ viewports: { side: { x: 20, y: 10, scale: 2 } } });
  });

  it('lights up the other tile and lands the piece under the pointer there', () => {
    pointerOverSurface('side', 'tile');
    const drag = dragOn(split, 'worker.red.1');
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [500, 0]);
    expect(useStore.getState().dropSurface).toBe('side');
    // Its own tile cannot draw it there, so a copy shows above the tiles instead.
    expect(copies).toHaveLength(1);
    expect(node(drag, 'worker.red.1').opacity()).toBe(0);
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(copies[0]!.removed).toBe(true);
    expect(node(drag, 'worker.red.1').opacity()).toBe(1);
    // [300, 200] on the page is [200, 100] in the tile, and [90, 45] on its surface.
    expect(sent).toEqual([{ type: 'move', ids: ['worker.red.1'], to: [90, 45], surface: 'side' }]);
    expect(useStore.getState().dropSurface).toBeUndefined();
  });

  it('sends pieces dropped on a chip to free room on its surface', () => {
    pointerOverSurface('side', 'chip');
    useStore.getState().select(['worker.red.1', 'worker.red.2']);
    const drag = dragOn(split, 'worker.red.1', 'worker.red.2');
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [0, -300]);
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([
      { type: 'move', ids: ['worker.red.1', 'worker.red.2'], to: 'surface:side' },
    ]);
  });

  it('moves a piece as ever over its own tile', () => {
    pointerOverSurface('centre', 'tile');
    const drag = dragOn(split, 'worker.red.1');
    drag.start('worker.red.1');
    pull(drag, 'worker.red.1', [0, 100]);
    expect(useStore.getState().dropSurface).toBeUndefined();
    expect(copies).toHaveLength(0);
    drag.end('worker.red.1', node(drag, 'worker.red.1'));
    expect(sent).toEqual([{ type: 'move', ids: ['worker.red.1'], by: [0, 100] }]);
  });

  it('takes a card off a pile to the other tile', () => {
    pointerOverSurface('side', 'tile');
    const stack = split.objects['deck:actions'] as Stack;
    const drag = dragOn(split);
    const card = new Konva.Group({ x: 0, y: 150 });
    drag.drawStart(stack);
    drag.drawMove(stack, card);
    expect(useStore.getState().dropSurface).toBe('side');
    expect(copies).toHaveLength(1);
    drag.drawEnd(stack, stack.items.at(-1)!, card, [0, 0]);
    expect(sent).toEqual([{ type: 'draw', from: 'deck:actions', to: [90, 45], surface: 'side' }]);
  });
});
