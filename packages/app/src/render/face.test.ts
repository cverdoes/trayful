import { describe, expect, it } from 'vitest';
import {
  boxStart,
  fontStyle,
  imageBox,
  layerSize,
  textBox,
  tileRect,
  type TextLayer,
} from './face';

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

describe('tileRect', () => {
  it('takes the whole image when there is no tile', () => {
    expect(tileRect([120, 80], undefined)).toEqual({ x: 0, y: 0, width: 120, height: 80 });
  });

  it('takes one tile, counted along each row, then down', () => {
    const sheet = { rows: 2, cols: 3 };
    expect(tileRect([120, 80], { ...sheet, index: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
    expect(tileRect([120, 80], { ...sheet, index: 4 })).toEqual({
      x: 40,
      y: 40,
      width: 40,
      height: 40,
    });
  });
});

describe('imageBox', () => {
  const box: [number, number, number, number] = [10, 10, 40, 20];
  const whole = { x: 0, y: 0, width: 100, height: 100 };
  const tile = { x: 100, y: 200, width: 100, height: 100 };

  it('stretches an image to its box', () => {
    expect(imageBox('stretch', box, whole)).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      crop: whole,
    });
  });

  it('fits a whole image in its box, centred', () => {
    expect(imageBox('contain', box, tile)).toEqual({
      x: 20,
      y: 10,
      width: 20,
      height: 20,
      crop: tile,
    });
  });

  it('covers the box by default, cropping the image to the box’s shape', () => {
    expect(imageBox(undefined, box, whole)).toEqual({
      x: 10,
      y: 10,
      width: 40,
      height: 20,
      crop: { x: 0, y: 25, width: 100, height: 50 },
    });
  });

  it('crops a tile within the tile, not the whole image', () => {
    expect(imageBox('cover', box, tile).crop).toEqual({ x: 100, y: 225, width: 100, height: 50 });
  });
});
