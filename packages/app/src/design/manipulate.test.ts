import type { Layer } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  handlesOf,
  keepFixedCorner,
  movedLayer,
  pivotOf,
  resizedLayer,
  rotatedLayer,
  snapBox,
  snapLines,
  snapPoint,
  unrotate,
} from './manipulate';
import { layerBounds } from './layout';

const face: [number, number] = [63, 88];
const rect: Layer = { shape: 'rect', at: [10, 10], size: [20, 10] };

describe('snapping', () => {
  const lines = snapLines(face, [rect]);

  it('lines up with the face and the other layers', () => {
    expect(lines.x).toEqual([0, 31.5, 63, 10, 20, 30]);
    expect(lines.y).toEqual([0, 44, 88, 10, 15, 20]);
  });

  it('shifts a box by whichever of its edges or centre is nearest a line', () => {
    // The box's centre is 0.8 mm off the face's centre.
    const { shift, guides } = snapBox({ x: 22.3, y: 50.2, w: 10, h: 10 }, lines, 1);
    expect(shift[0]).toBeCloseTo(-0.8);
    expect(guides).toEqual([{ axis: 'x', at: 31.5 }]);
    // Nothing near on y, so its top goes to the 5 mm grid.
    expect(shift[1]).toBeCloseTo(-0.2);
  });

  it('leaves what is far from everything where it is', () => {
    expect(snapBox({ x: 41.7, y: 52.6, w: 4, h: 4 }, lines, 0.5).shift).toEqual([0, 0]);
  });

  it('snaps a point the same way', () => {
    expect(snapPoint([30.4, 60.6], lines, 1)).toEqual({
      point: [30, 60],
      guides: [{ axis: 'x', at: 30 }],
    });
  });
});

describe('changing a layer', () => {
  it('moves it, keeping tenths of a millimetre', () => {
    expect(movedLayer(rect, [1.234, -2])).toMatchObject({ at: [11.2, 8] });
  });

  it('resizes a box from any corner, the opposite one staying put', () => {
    expect(resizedLayer(rect, 'se', [40, 30], face)).toMatchObject({
      at: [10, 10],
      size: [30, 20],
    });
    expect(resizedLayer(rect, 'nw', [5, 5], face)).toMatchObject({ at: [5, 5], size: [25, 15] });
    // Dragged past the opposite corner, the box flips over.
    expect(resizedLayer(rect, 'ne', [0, 30], face)).toMatchObject({ at: [0, 20], size: [10, 10] });
  });

  it('changes a circle drawn from its centre by its radius, and a text by its wrap width', () => {
    expect(
      resizedLayer({ shape: 'circle', at: [30, 30], r: 5 }, 'se', [33, 34], face),
    ).toMatchObject({
      r: 5,
    });
    const text: Layer = { text: 'Hi', at: [10, 20] };
    expect(resizedLayer(text, 'e', [50, 20], face)).toMatchObject({ at: [10, 20], width: 40 });
  });

  it('turns it as far as the pointer turns around it, snapping to 15° steps', () => {
    expect(rotatedLayer(rect, [10, 0], [20, 10], face)).toMatchObject({ rotate: 90 });
    expect(rotatedLayer(rect, [10, 0], [20, 2], face)).toMatchObject({ rotate: 51 });
    // Pressing the handle without moving leaves it as it was.
    expect(rotatedLayer(rect, [20, 7], [20, 7.1], face)).not.toHaveProperty('rotate');
    expect(rotatedLayer({ ...rect, rotate: 45 }, [20, 10], [20, 0], face)).not.toHaveProperty(
      'rotate',
    );
  });

  it('keeps the fixed corner of a turned layer in place while resizing', () => {
    const turned: Layer = { ...rect, rotate: 90 };
    const resized = resizedLayer(turned, 'nw', [5, 5], face);
    expect(keepFixedCorner(turned, resized, 'nw', face)).toMatchObject({
      at: [15, 5],
      size: [25, 15],
    });
    expect(keepFixedCorner(rect, resized, 'nw', face)).toBe(resized);
  });

  it('turns around the point the renderer turns it around', () => {
    expect(pivotOf(rect, face)).toEqual([10, 10]);
    expect(pivotOf({ shape: 'ellipse', at: [10, 10], size: [20, 10] }, face)).toEqual([20, 15]);
    expect(pivotOf({ text: 'x', at: [10, 10] }, face)).toEqual([10, 10]);
    const back = unrotate([10, 20], [10, 10], 90);
    expect(back[0]).toBeCloseTo(20);
    expect(back[1]).toBeCloseTo(10);
  });

  it('has corner handles, or one wrap handle for text', () => {
    expect(handlesOf(rect, layerBounds(rect, face)).map(([h]) => h)).toEqual([
      'nw',
      'ne',
      'sw',
      'se',
    ]);
    const text: Layer = { text: 'x', at: [0, 0] };
    expect(handlesOf(text, layerBounds(text, face)).map(([h]) => h)).toEqual(['e']);
  });
});
