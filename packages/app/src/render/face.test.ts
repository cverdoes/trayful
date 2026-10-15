import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  BACK_FILL,
  boxStart,
  DEFAULT_FILL,
  fillOf,
  fontStyle,
  imageBox,
  layerSize,
  textBox,
  type TextLayer,
} from './face';

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

describe('textBox', () => {
  const text = (fields: Partial<TextLayer> = {}): TextLayer => ({ text: 'Hi', ...fields });

  it('puts unwrapped text on its anchor as aligned', () => {
    expect(textBox(text({ at: [50, 20] }))).toEqual({
      x: 50,
      y: 20,
      width: 400,
      height: undefined,
      align: 'left',
      valign: 'top',
      wrap: 'none',
    });
    expect(textBox(text({ at: [50, 20], align: 'center', valign: 'middle' }))).toMatchObject({
      x: -150,
      y: -180,
      height: 400,
    });
    expect(textBox(text({ at: [50, 20], align: 'right', valign: 'bottom' }))).toMatchObject({
      x: -350,
      y: -380,
    });
  });

  it('wraps text with a width inside a box starting at its anchor', () => {
    expect(textBox(text({ at: [5, 5], width: 30, align: 'center' }))).toMatchObject({
      x: 5,
      width: 30,
      wrap: 'word',
    });
  });
});

describe('fontStyle', () => {
  it('combines bold and italic', () => {
    expect(fontStyle(undefined)).toBe('normal');
    expect(fontStyle({ weight: 'bold' })).toBe('bold');
    expect(fontStyle({ weight: 'bold', style: 'italic' })).toBe('bold italic');
  });
});

describe('imageBox', () => {
  const box: [number, number, number, number] = [10, 10, 40, 20];

  it('stretches an image to its box', () => {
    expect(imageBox('stretch', box, [100, 100])).toEqual({ x: 10, y: 10, width: 40, height: 20 });
  });

  it('fits a whole image in its box, centred', () => {
    expect(imageBox('contain', box, [100, 100])).toEqual({ x: 20, y: 10, width: 20, height: 20 });
  });

  it('covers the box by default, cropping the image to the box’s shape', () => {
    expect(imageBox(undefined, box, [100, 100])).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      crop: { x: 0, y: 25, width: 100, height: 50 },
    });
  });
});
