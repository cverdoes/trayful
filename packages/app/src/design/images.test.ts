import { describe, expect, it } from 'vitest';
import { imageChoice, imageRef, tileModes, withAsset } from './images';

const images = {
  art: { file: 'art.svg', rows: 1, cols: 1 },
  sheet: { file: 'sheet.png', rows: 2, cols: 3 },
};

describe('image choices', () => {
  it('reads every way a reference can be written', () => {
    expect(imageChoice(undefined, images, false)).toBeUndefined();
    expect(imageChoice('art', images, false)).toEqual({ asset: 'art', mode: 'whole', tile: 0 });
    expect(imageChoice({ asset: 'sheet', tile: 4 }, images, false)).toEqual({
      asset: 'sheet',
      mode: 'tile',
      tile: 4,
    });
    // Row 1, column 2 of a sheet three wide is tile 5.
    expect(imageChoice({ asset: 'sheet', row: 1, col: 2 }, images, false)?.tile).toBe(5);
    expect(imageChoice({ asset: 'sheet', tile: 'value', fit: 'contain' }, images, true)).toEqual({
      asset: 'sheet',
      mode: 'value',
      tile: 0,
      fit: 'contain',
    });
    expect(imageChoice({ asset: 'art', fit: 'stretch' }, images, false)?.mode).toBe('whole');
    // On a die, a tiled image that names no tile shows the tile of its value.
    expect(imageChoice('sheet', images, true)?.mode).toBe('value');
    expect(imageChoice('sheet', images, false)?.mode).toBe('whole');
  });

  it('writes the shortest reference that says the same', () => {
    expect(imageRef({ asset: 'art', mode: 'whole', tile: 0 })).toBe('art');
    expect(imageRef({ asset: 'art', mode: 'whole', tile: 0, fit: 'contain' })).toEqual({
      asset: 'art',
      fit: 'contain',
    });
    expect(imageRef({ asset: 'sheet', mode: 'tile', tile: 3 })).toEqual({
      asset: 'sheet',
      tile: 3,
    });
    expect(imageRef({ asset: 'sheet', mode: 'instance', tile: 3 })).toEqual({
      asset: 'sheet',
      tile: 'instance',
    });
  });

  it('offers tiles only for tiled images, and values only on dice and counters', () => {
    expect(tileModes(images.art, true)).toEqual(['whole']);
    expect(tileModes(images.sheet, false)).toEqual(['whole', 'tile', 'instance']);
    expect(tileModes(images.sheet, true)).toEqual(['value', 'tile', 'instance']);
  });

  it('keeps what it can of a choice when the image changes', () => {
    const choice = { asset: 'sheet', mode: 'tile', tile: 5, fit: 'contain' } as const;
    expect(withAsset(choice, 'art', images.art, false)).toEqual({
      asset: 'art',
      mode: 'whole',
      tile: 0,
      fit: 'contain',
    });
    expect(withAsset(choice, 'other', { rows: 3, cols: 3 }, false)).toMatchObject({
      mode: 'tile',
      tile: 5,
    });
    expect(withAsset(undefined, 'sheet', images.sheet, true).mode).toBe('value');
    expect(withAsset(undefined, 'art', images.art, false)).toEqual({
      asset: 'art',
      mode: 'whole',
      tile: 0,
    });
  });
});
