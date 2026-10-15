import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { press, rotateHandle, type Press } from './gestures';

const card: ComponentType = {
  id: 'card',
  base: 'card',
  size: [60, 90],
  front: {
    layers: [
      { shape: 'rect', at: [0, 0], size: [60, 90] },
      { shape: 'rect', at: [10, 10], size: [20, 10] },
    ],
  },
};
const at = (point: [number, number], type = card): Press => ({
  type,
  side: 'front',
  point,
  tolerance: 1,
});

describe('pressing on a layer', () => {
  it('picks the topmost layer under the pointer and drags it, snapping on the way', () => {
    const result = press(at([12, 12]), { side: 'front' });
    expect(result.selection).toEqual({ side: 'front', layer: 1 });
    const { type, guides } = result.gesture!([22.6, 12]);
    expect(type.front?.layers?.[1]).toMatchObject({ at: [20, 10] });
    expect(guides).toEqual([{ axis: 'x', at: 30 }]);
  });

  it('drags a handle of the selected layer', () => {
    const result = press(at([30, 20]), { side: 'front', layer: 1 });
    expect(result.gesture!([40, 30]).type.front?.layers?.[1]).toMatchObject({ size: [30, 20] });
  });

  it('turns the selected layer by its rotate handle', () => {
    const handle = rotateHandle({ x: 10, y: 10, w: 20, h: 10 }, 1);
    const result = press(at(handle), { side: 'front', layer: 1 });
    expect(result.gesture!([20, 10]).type.front?.layers?.[1]).toMatchObject({ rotate: 90 });
  });

  it('selects nothing on empty space', () => {
    const empty = { ...card, front: {} };
    expect(press(at([5, 5], empty), { side: 'front', layer: 0 })).toEqual({
      selection: { side: 'front' },
    });
  });
});

describe('pressing with a snap target', () => {
  const board: ComponentType = {
    id: 'board',
    base: 'board',
    size: [100, 100],
    snap: [
      { id: 'track', points: [[10, 10]] },
      { id: 'grid', grid: { origin: [50, 50], cols: 2, rows: 2, cell: 10 } },
    ],
  };

  it('picks a target by one of its spots', () => {
    expect(press(at([60, 50.5], board), { side: 'front' }).selection).toEqual({
      side: 'front',
      target: 1,
    });
  });

  it('drags a handle of the selected target', () => {
    const result = press(at([50, 50], board), { side: 'front', target: 1 });
    expect(result.gesture!([20.4, 30]).type.snap?.[1]?.grid?.origin).toEqual([20, 30]);
  });

  it('adds a spot to a selected track where it is pressed, kept even without a drag', () => {
    const result = press(at([40.3, 80], board), { side: 'front', target: 0 });
    expect(result.changed?.snap?.[0]?.points).toEqual([
      [10, 10],
      [40, 80],
    ]);
    expect(result.gesture!([70, 80]).type.snap?.[0]?.points?.[1]).toEqual([70, 80]);
  });
});
