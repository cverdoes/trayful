import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { BACK_FILL, boxStart, DEFAULT_FILL, fillOf, layerSize } from './face';

const card = (fields: Partial<ComponentType> = {}) =>
  ({ id: 'card', base: 'card', ...fields }) as ComponentType;
// Colours are resolved as they are written; the resolver only has to pass them through.
const asWritten = (color: string | undefined) => color;

describe('fillOf', () => {
  it('uses the shown face’s own fill first', () => {
    const type = card({ fill: 'red', front: { fill: 'blue' } });
    expect(fillOf(type, false, asWritten)).toBe('blue');
  });

  it('falls back to the type’s fill on the front', () => {
    expect(fillOf(card({ fill: 'red' }), false, asWritten)).toBe('red');
  });

  it('gives a back the type does not define the plain back colour', () => {
    expect(fillOf(card({ fill: 'red' }), true, asWritten)).toBe(BACK_FILL);
  });

  it('does not use the type’s fill on a back the type defines', () => {
    const type = card({ fill: 'red', back: {} });
    expect(fillOf(type, true, asWritten)).toBe(BACK_FILL);
  });

  it('leaves a zone without a fill transparent', () => {
    expect(fillOf(card({ base: 'zone' }), false, asWritten)).toBe('transparent');
  });

  it('gives anything else without a fill the default colour', () => {
    expect(fillOf(card(), false, asWritten)).toBe(DEFAULT_FILL);
  });
});

describe('boxStart', () => {
  it('starts a box at its anchor, centred on it, or ending at it', () => {
    expect(boxStart(100, 'start', 40)).toBe(100);
    expect(boxStart(100, 'center', 40)).toBe(80);
    expect(boxStart(100, 'end', 40)).toBe(60);
  });
});

describe('layerSize', () => {
  it('reads one number as a square and a pair as width and height', () => {
    expect(layerSize(5, [0, 0])).toEqual([5, 5]);
    expect(layerSize([5, 8], [0, 0])).toEqual([5, 8]);
  });

  it('uses the fallback when a layer gives no size', () => {
    expect(layerSize(undefined, [63, 88])).toEqual([63, 88]);
  });
});
