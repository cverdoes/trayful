import { describe, expect, it } from 'vitest';
import { fitScale, layerAt, layerBounds } from './layout';

const face: [number, number] = [63, 88];

describe('layerBounds', () => {
  it('covers shapes, circles and images', () => {
    expect(layerBounds({ shape: 'rect', at: [5, 5], size: [20, 10] }, face)).toEqual({
      x: 5,
      y: 5,
      w: 20,
      h: 10,
    });
    expect(layerBounds({ shape: 'circle', at: [10, 10], r: 4 }, face)).toEqual({
      x: 6,
      y: 6,
      w: 8,
      h: 8,
    });
    expect(layerBounds({ image: 'a.svg' }, face)).toEqual({ x: 0, y: 0, w: 63, h: 88 });
  });

  it('measures text roughly, from where it is aligned', () => {
    const left = layerBounds({ text: 'Hello', at: [10, 10] }, face);
    expect(left.x).toBe(10);
    expect(left.w).toBeGreaterThan(0);
    const right = layerBounds(
      { text: 'Hello', at: [50, 80], align: 'right', valign: 'bottom' },
      face,
    );
    expect(right.x + right.w).toBeCloseTo(50);
    expect(right.y + right.h).toBeCloseTo(80);
    const wrapped = layerBounds(
      { text: 'Long text', at: [5, 5], width: 40, align: 'center' },
      face,
    );
    expect(wrapped).toMatchObject({ x: 5, w: 40 });
  });
});

it('finds the topmost layer under a point', () => {
  const layers = [
    { shape: 'rect' as const, at: [0, 0] as [number, number], size: [63, 88] as [number, number] },
    {
      shape: 'rect' as const,
      at: [10, 10] as [number, number],
      size: [10, 10] as [number, number],
    },
  ];
  expect(layerAt(layers, [15, 15], face)).toBe(1);
  expect(layerAt(layers, [40, 40], face)).toBe(0);
  expect(layerAt(layers, [70, 40], face)).toBeUndefined();
});

it('scales a face to fit the space around it', () => {
  expect(fitScale([100, 50], [248, 1000])).toBe(2);
  expect(fitScale([100, 100], [10, 10])).toBeCloseTo(0.1);
});
