import { describe, expect, it } from 'vitest';
import { type Assets } from './component.js';
import {
  BACK_FILL,
  DEFAULT_FILL,
  drawingOf,
  isShown,
  resolveColor,
  type Shown,
} from './drawing.js';
import type { ComponentType } from './schemas.js';

const assets: Assets = {
  images: {
    art: { file: 'art/a.svg', rows: 1, cols: 1 },
    sheet: { file: 'sheet.png', rows: 2, cols: 3 },
  },
  colors: { red: '#d94b3d', ink: '#222233' },
};

const piece = (props: Partial<ComponentType> = {}): ComponentType => ({
  id: 'p',
  size: 10,
  is: 'piece',
  ...props,
});

const up: Shown = { face: 'up' };
const draw = (type: ComponentType, shown: Partial<Shown> = {}) =>
  drawingOf(type, { ...up, ...shown }, assets);

describe('drawingOf: outline and fill', () => {
  it('draws a plain piece as a light rectangle with square corners', () => {
    expect(draw(piece())).toEqual({
      outline: 'rect',
      corner: 0,
      fill: DEFAULT_FILL,
      stroke: '#5c5346',
      dashed: false,
      layers: [],
      plainBack: false,
      valueText: undefined,
    });
  });

  it('takes the outline and corner from the face, for both sides', () => {
    const type = piece({ face: { shape: 'hex', corner: 3 }, flippable: true });
    expect(draw(type)).toMatchObject({ outline: 'hex', corner: 3 });
    expect(draw(type, { face: 'down' })).toMatchObject({ outline: 'hex', corner: 3 });
  });

  it('leaves a zone transparent and dashed', () => {
    expect(draw(piece({ is: 'zone' }))).toMatchObject({ fill: 'transparent', dashed: true });
  });

  it('draws a stamp with neither background nor outline, unless it asks', () => {
    expect(draw(piece({ is: 'stamp' }))).toMatchObject({
      fill: 'transparent',
      stroke: 'transparent',
      dashed: false,
    });
    expect(draw(piece({ is: 'stamp', face: { stroke: 'red' } }))).toMatchObject({
      stroke: '#d94b3d',
    });
  });

  it('draws a plain back for a flippable piece that does not describe its back', () => {
    const type = piece({ face: { fill: 'red' }, flippable: true });
    expect(draw(type, { face: 'down' })).toMatchObject({ fill: BACK_FILL, plainBack: true });
    expect(draw(type)).toMatchObject({ fill: '#d94b3d', plainBack: false });
  });

  it('draws a described back with its own fill, or the back fill when it has none', () => {
    const back = piece({ flippable: { back: { fill: 'ink', stroke: 'red' } } });
    expect(draw(back, { face: 'down' })).toMatchObject({
      fill: '#222233',
      stroke: '#d94b3d',
      plainBack: false,
    });
    const unfilled = piece({ flippable: { back: { labels: [{ text: 'Back' }] } } });
    expect(draw(unfilled, { face: 'down' })).toMatchObject({ fill: BACK_FILL, plainBack: false });
  });

  it('shows the face of a piece that cannot be flipped, whichever way it lies', () => {
    expect(draw(piece({ face: { fill: 'red' } }), { face: 'down' })).toMatchObject({
      fill: '#d94b3d',
      plainBack: false,
    });
  });

  it('resolves colours through the assets file and `{{field}}` templates', () => {
    const type = piece({ face: { fill: '{{suit}}', stroke: '{{edge}}' } });
    expect(draw(type, { data: { suit: 'red', edge: '#123' } })).toMatchObject({
      fill: '#d94b3d',
      stroke: '#123',
    });
    expect(draw(type, { data: {} })).toMatchObject({ fill: DEFAULT_FILL, stroke: '#5c5346' });
  });
});

describe('drawingOf: labels and layers', () => {
  it('draws a field label with the field value, and a text label with its text', () => {
    const type = piece({
      face: {
        labels: [
          { field: 'name', at: [5, 5], color: 'red', font: { size: 14 } },
          { text: 'Cost {{cost}}', align: 'center', valign: 'middle', width: 20, rotate: 90 },
          { field: 'missing' },
          { text: 'Hidden', when: '{{flag}}' },
        ],
      },
    });
    expect(draw(type, { data: { name: 'Harvest', cost: 2, flag: 0 } }).layers).toEqual([
      {
        kind: 'text',
        at: [5, 5],
        rotate: 0,
        opacity: 1,
        text: 'Harvest',
        width: undefined,
        align: 'left',
        valign: 'top',
        font: { size: 14 },
        color: '#d94b3d',
      },
      {
        kind: 'text',
        at: [0, 0],
        rotate: 90,
        opacity: 1,
        text: 'Cost 2',
        width: 20,
        align: 'center',
        valign: 'middle',
        font: undefined,
        color: '#111',
      },
    ]);
  });

  it('draws the face image first, then layers, then labels', () => {
    const type = piece({
      face: {
        image: 'art',
        labels: [{ text: 'Label' }],
        layers: [{ shape: 'circle', r: 2, fill: 'red', stroke: 'ink' }, { shape: 'rect' }],
      },
    });
    const layers = draw(type).layers;
    expect(layers.map((l) => l.kind)).toEqual(['image', 'shape', 'shape', 'text']);
    expect(layers[0]).toEqual({
      kind: 'image',
      at: [0, 0],
      rotate: 0,
      opacity: 1,
      file: 'art/a.svg',
      tile: undefined,
      fit: 'cover',
    });
    expect(layers[1]).toMatchObject({ fill: '#d94b3d', stroke: '#222233', strokeWidth: 0.3 });
    expect(layers[2]).toMatchObject({ fill: undefined, stroke: undefined, strokeWidth: 0 });
  });

  it('finds layer images by asset name or file, and skips empty ones', () => {
    const type = piece({
      face: {
        layers: [
          { image: 'art', fit: 'contain', size: 5, opacity: 0.5 },
          { image: '{{picture}}' },
          { image: '{{none}}' },
          { text: '{{none}}' },
        ],
      },
      fields: { picture: 'image?', none: 'string?' },
    });
    expect(draw(type, { data: { picture: 'pics/x.png' } }).layers).toMatchObject([
      { kind: 'image', file: 'art/a.svg', fit: 'contain', size: 5, opacity: 0.5 },
      { kind: 'image', file: 'pics/x.png', fit: 'cover' },
    ]);
  });

  it('leaves out a face image whose asset is unknown', () => {
    expect(draw(piece({ face: { image: 'nope' } })).layers).toEqual([]);
  });
});

describe('drawingOf: tiles', () => {
  const tileOf = (type: ComponentType, shown: Partial<Shown> = {}) => {
    const image = draw(type, shown).layers[0];
    return image?.kind === 'image' ? image.tile : undefined;
  };

  it('shows the whole image, or a fixed tile counted by number or by row and column', () => {
    expect(tileOf(piece({ face: { image: 'sheet' } }))).toBeUndefined();
    expect(tileOf(piece({ face: { image: { asset: 'sheet', tile: 4 } } }))).toEqual({
      index: 4,
      rows: 2,
      cols: 3,
    });
    expect(tileOf(piece({ face: { image: { asset: 'sheet', row: 1, col: 2 } } }))?.index).toBe(5);
    expect(tileOf(piece({ face: { image: { asset: 'sheet', tile: 9 } } }))?.index).toBe(5);
  });

  it('lets each component pick its tile with its `tile` value, kept within the image', () => {
    const type = piece({ face: { image: { asset: 'sheet', tile: 'instance', fit: 'contain' } } });
    expect(tileOf(type, { data: { tile: 2 } })?.index).toBe(2);
    expect(tileOf(type, { data: {} })?.index).toBe(0);
    expect(tileOf(type, { data: { tile: 40 } })?.index).toBe(5);
    expect(tileOf(type, { data: { tile: -1 } })?.index).toBe(0);
    expect(tileOf(type, { data: { tile: 'x' } })).toBeUndefined();
    expect(draw(type).layers[0]).toMatchObject({ fit: 'contain' });
  });

  it('shows the tile of a die value on a tiled image, and hides the value text', () => {
    const die = piece({ is: 'die', face: { corner: 2, image: 'sheet' } });
    expect(tileOf(die, { value: 4 })?.index).toBe(3);
    expect(tileOf(die, { value: 'x' })?.index).toBe(0);
    expect(draw(die, { value: 4 }).valueText).toBeUndefined();
    const valued = piece({ is: 'counter', face: { image: { asset: 'sheet', tile: 'value' } } });
    expect(tileOf(valued, { value: 2 })?.index).toBe(2);
  });

  it('shows the whole image on a die when the image is a single tile, and its value over it', () => {
    const die = piece({ is: 'die', face: { image: 'art' } });
    expect(tileOf(die, { value: 3 })).toBeUndefined();
    expect(draw(die, { value: 3 }).valueText).toBe('3');
    const fixed = piece({ is: 'counter', face: { image: { asset: 'sheet', tile: 1 } } });
    expect(draw(fixed, { value: 7 }).valueText).toBe('7');
  });

  it('writes the value of a die or counter without an image', () => {
    expect(draw(piece({ is: 'counter' }), { value: 12 }).valueText).toBe('12');
    expect(draw(piece({ is: 'die' })).valueText).toBeUndefined();
    expect(draw(piece(), { value: 3 }).valueText).toBeUndefined();
  });
});

describe('resolveColor and isShown', () => {
  it('fills templates, then looks names up in the colours', () => {
    expect(resolveColor(undefined, {}, {})).toBeUndefined();
    expect(resolveColor('{{x}}', {}, {})).toBeUndefined();
    expect(resolveColor('{{x}}', { x: 'red' }, { red: '#f00' })).toBe('#f00');
    expect(resolveColor('blue', {}, { red: '#f00' })).toBe('blue');
  });

  it('hides on empty, false or 0', () => {
    expect(isShown(undefined, {})).toBe(true);
    expect(isShown('{{a}}', { a: 'yes' })).toBe(true);
    for (const a of ['', 'false', 0, false, undefined]) expect(isShown('{{a}}', { a })).toBe(false);
  });
});
