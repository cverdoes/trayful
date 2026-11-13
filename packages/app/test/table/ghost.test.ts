import type Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DragGhost, ghostCorner } from '../../src/table/ghost';

/** The tile the drag starts on: 400 by 300 page pixels, 100 from the left of the page. */
const TILE = { left: 100, top: 0, right: 500, bottom: 300 };

/** A canvas element as the page would make it, recording what is drawn onto it. */
function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    className: '',
    style: { width: '', height: '', transform: '' },
    drawn: [] as [number, number][],
    removed: false,
    getContext() {
      return { drawImage: (_: unknown, x: number, y: number) => this.drawn.push([x, y]) };
    },
    remove() {
      this.removed = true;
    },
  };
}

/** A dragged canvas node at `rect` on its tile's canvas, which is shown at `zoom`. */
function fakeNode(rect: { x: number; y: number; width: number; height: number }, zoom = 2) {
  let opacity = 1;
  const stage = { container: () => ({ getBoundingClientRect: () => TILE }), scaleX: () => zoom };
  return {
    getStage: () => stage,
    getClientRect: () => rect,
    toCanvas: () => ({}),
    opacity(value?: number) {
      if (value !== undefined) opacity = value;
      return opacity;
    },
  } as unknown as Konva.Node;
}

let made: ReturnType<typeof fakeCanvas>[];

beforeEach(() => {
  made = [];
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = fakeCanvas();
      made.push(canvas);
      return canvas;
    },
    body: { append: () => undefined },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('the copy of a dragged piece', () => {
  it('keeps the point it is held by under the pointer at any size', () => {
    expect(ghostCorner({ x: 10, y: 20 }, { x: 300, y: 200 }, 1)).toEqual({ x: 290, y: 180 });
    expect(ghostCorner({ x: 10, y: 20 }, { x: 300, y: 200 }, 2)).toEqual({ x: 280, y: 160 });
  });

  it('stays away while the pointer is on the tile the drag started on', () => {
    const ghost = new DragGhost();
    const piece = fakeNode({ x: 380, y: 100, width: 40, height: 40 });
    ghost.follow([piece], { x: 490, y: 120 }, undefined);
    expect(made).toHaveLength(0);
    expect(piece.opacity()).toBe(1);
  });

  it('shows the dragged pieces above the tiles once the pointer leaves their tile', () => {
    const ghost = new DragGhost();
    const pieces = [
      fakeNode({ x: 400, y: 100, width: 40, height: 40 }),
      fakeNode({ x: 450, y: 120, width: 20, height: 30 }),
    ];
    ghost.follow(pieces, { x: 510, y: 120 }, 2);
    expect(made).toHaveLength(1);
    const [copy] = made;
    // One canvas holding both pieces, each drawn where it lies in that box.
    expect([copy!.width, copy!.height]).toEqual([70, 50]);
    expect(copy!.drawn).toEqual([
      [0, 0],
      [50, 20],
    ]);
    // Held where the pointer took it: 10 px into the box, 20 down.
    expect(copy!.style.transform).toBe('translate(500px, 100px) scale(1)');
    expect(pieces.map((p) => p.opacity())).toEqual([0, 0]);
  });

  it('is drawn at the zoom of the tile under the pointer', () => {
    const ghost = new DragGhost();
    const piece = fakeNode({ x: 400, y: 100, width: 40, height: 40 }, 2);
    ghost.follow([piece], { x: 510, y: 120 }, 2);
    ghost.follow([piece], { x: 610, y: 120 }, 1);
    expect(made[0]!.style.transform).toBe('translate(605px, 110px) scale(0.5)');
    // Over no tile, such as a chip, it keeps the size it was taken at.
    ghost.follow([piece], { x: 700, y: 20 }, undefined);
    expect(made[0]!.style.transform).toBe('translate(690px, 0px) scale(1)');
    expect(made).toHaveLength(1);
  });

  it('goes away and shows the pieces again when the pointer comes back or the drag ends', () => {
    const ghost = new DragGhost();
    const piece = fakeNode({ x: 400, y: 100, width: 40, height: 40 });
    ghost.follow([piece], { x: 510, y: 120 }, 2);
    ghost.follow([piece], { x: 450, y: 120 }, 2);
    expect(made[0]!.removed).toBe(true);
    expect(piece.opacity()).toBe(1);

    ghost.follow([piece], { x: 520, y: 120 }, 2);
    expect(made).toHaveLength(2);
    ghost.clear();
    expect(made[1]!.removed).toBe(true);
    expect(piece.opacity()).toBe(1);
    ghost.clear();
  });
});
