import { describe, expect, it } from 'vitest';
import { colourLook } from '../../src/ui/ColourPicker';

const colours = { brick: '#c5523a' };

describe('colourLook', () => {
  it('shows no colour as none', () => {
    expect(colourLook(undefined, colours)).toEqual({ swatch: 'none', text: 'none' });
    expect(colourLook('', colours)).toEqual({ swatch: 'none', text: 'none' });
  });

  it('shows a named colour by its name, in the colour it names', () => {
    expect(colourLook('brick', colours)).toEqual({ swatch: '#c5523a', text: 'brick' });
  });

  it('shows any other colour as it is written', () => {
    expect(colourLook('#123456', colours)).toEqual({ swatch: '#123456', text: '#123456' });
  });

  it('marks transparent and a field’s colour with their own swatches', () => {
    expect(colourLook('transparent', colours).swatch).toBe('transparent');
    expect(colourLook('{{colour}}', colours)).toEqual({ swatch: 'field', text: '{{colour}}' });
  });
});
