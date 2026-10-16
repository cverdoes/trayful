import { describe, expect, it } from 'vitest';
import {
  areaAccepts,
  assetsOf,
  backOf,
  componentFields,
  dropAreas,
  imageRefs,
  isStackable,
  isValued,
  picksTile,
  rotationStep,
  sidesOf,
  stacksWith,
  startValue,
  stepValue,
  valueAt,
  valueCount,
  valueIndex,
  valuesOf,
  type ValueSpec,
} from './component.js';
import type { ComponentType } from './schemas.js';

const piece = (props: Partial<ComponentType> = {}): ComponentType => ({
  id: 'p',
  size: 10,
  is: 'piece',
  ...props,
});

describe('assetsOf', () => {
  it('gives every image its tiling, defaulting to one tile', () => {
    expect(
      assetsOf({
        kind: 'assets',
        images: {
          back: 'back.svg',
          dice: { file: 'dice.svg', rows: 2, cols: 3 },
          row: { file: 'r.png', cols: 4 },
        },
        colors: { red: '#f00' },
      }),
    ).toEqual({
      images: {
        back: { file: 'back.svg', rows: 1, cols: 1 },
        dice: { file: 'dice.svg', rows: 2, cols: 3 },
        row: { file: 'r.png', rows: 1, cols: 4 },
      },
      colors: { red: '#f00' },
    });
    expect(assetsOf(undefined)).toEqual({ images: {}, colors: {} });
  });
});

describe('sides and backs', () => {
  it('has two sides only when flippable', () => {
    expect(sidesOf(piece())).toBe(1);
    expect(sidesOf(piece({ flippable: true }))).toBe(2);
    expect(sidesOf(piece({ flippable: { back: { fill: 'red' } } }))).toBe(2);
  });

  it('has a back only when the flippable options describe one', () => {
    expect(backOf(piece({ flippable: true }))).toBeUndefined();
    expect(backOf(piece({ flippable: {} }))).toBeUndefined();
    expect(backOf(piece({ flippable: { back: { fill: 'red' } } }))).toEqual({ fill: 'red' });
  });
});

describe('stacksWith', () => {
  const card = piece({ id: 'card', stackable: true });
  const token = piece({ id: 'token', stackable: { with: ['card'] } });
  const coin = piece({ id: 'coin', stackable: {} });
  const meeple = piece({ id: 'meeple' });

  it('needs both components to be stackable', () => {
    expect(isStackable(card)).toBe(true);
    expect(isStackable(meeple)).toBe(false);
    expect(stacksWith(meeple, meeple)).toBe(false);
    expect(stacksWith(card, meeple)).toBe(false);
  });

  it('stacks a component with itself', () => {
    expect(stacksWith(card, card)).toBe(true);
    expect(stacksWith(coin, coin)).toBe(true);
  });

  it('stacks with a partner named in `with`, whichever side names it', () => {
    expect(stacksWith(token, card)).toBe(true);
    expect(stacksWith(card, token)).toBe(true);
    expect(stacksWith(card, coin)).toBe(false);
    expect(stacksWith(token, coin)).toBe(false);
  });
});

describe('rotationStep', () => {
  it('turns in 90° steps unless a step is given, and not at all without rotates', () => {
    expect(rotationStep(piece())).toBeUndefined();
    expect(rotationStep(piece({ rotates: true }))).toBe(90);
    expect(rotationStep(piece({ rotates: {} }))).toBe(90);
    expect(rotationStep(piece({ rotates: { step: 60 } }))).toBe(60);
  });
});

describe('drop areas', () => {
  it('lists the drop areas of a container, and none otherwise', () => {
    const area = { id: 'a', area: { at: [0, 0] as [number, number], size: 5 } };
    expect(dropAreas(piece())).toEqual([]);
    expect(dropAreas(piece({ container: [area] }))).toEqual([area]);
  });

  it('accepts anything without a list, else components by id or representation', () => {
    const die = piece({ id: 'd6', is: 'die' });
    expect(areaAccepts({}, die)).toBe(true);
    expect(areaAccepts({ accepts: ['d6'] }, die)).toBe(true);
    expect(areaAccepts({ accepts: ['die'] }, die)).toBe(true);
    expect(areaAccepts({ accepts: ['piece', 'card'] }, die)).toBe(false);
  });
});

describe('values', () => {
  it('fills in the defaults for dice and counters', () => {
    expect(valuesOf(piece())).toBeUndefined();
    expect(valuesOf(piece({ is: 'die' }))).toEqual({ range: [1, 6], controls: ['roll'] });
    expect(valuesOf(piece({ is: 'counter' }))).toEqual({ range: [0, 99], controls: ['step'] });
    expect(valuesOf(piece({ is: 'die', values: { range: [0, 9], controls: ['step'] } }))).toEqual({
      range: [0, 9],
      controls: ['step'],
    });
    expect(valuesOf(piece({ is: 'die', values: { list: ['a', 'b'] } }))).toEqual({
      list: ['a', 'b'],
      controls: ['roll'],
    });
  });

  it('knows which representations carry a value', () => {
    expect(isValued(piece())).toBe(false);
    expect(isValued(piece({ is: 'zone' }))).toBe(false);
    expect(isValued(piece({ is: 'die' }))).toBe(true);
    expect(isValued(piece({ is: 'counter' }))).toBe(true);
  });

  const range: ValueSpec = { range: [2, 5], controls: ['step'] };
  const list: ValueSpec = { list: ['sword', 'shield', 3], controls: ['roll'] };

  it('counts values and finds them by position', () => {
    expect(valueCount(range)).toBe(4);
    expect(valueCount(list)).toBe(3);
    expect(valueAt(range, 0)).toBe(2);
    expect(valueAt(range, 3)).toBe(5);
    expect(valueAt(list, 1)).toBe('shield');
  });

  it('finds the position of a value, or -1 when it is not one', () => {
    expect(valueIndex(range, 4)).toBe(2);
    expect(valueIndex(range, 6)).toBe(-1);
    expect(valueIndex(range, 1)).toBe(-1);
    expect(valueIndex(range, 2.5)).toBe(-1);
    expect(valueIndex(range, '3')).toBe(-1);
    expect(valueIndex(list, 3)).toBe(2);
    expect(valueIndex(list, 'axe')).toBe(-1);
  });

  it('steps up and down, staying within the values', () => {
    expect(stepValue(range, 3, 1)).toBe(4);
    expect(stepValue(range, 5, 1)).toBe(5);
    expect(stepValue(range, 2, -1)).toBe(2);
    expect(stepValue(range, 'x', 1)).toBe(3);
    expect(stepValue(list, 'sword', 2)).toBe(3);
    expect(stepValue(list, 'shield', -5)).toBe('sword');
  });

  it('starts a die or counter on its first value', () => {
    expect(startValue(piece())).toBeUndefined();
    expect(startValue(piece({ is: 'die' }))).toBe(1);
    expect(startValue(piece({ is: 'counter', values: { range: [-3, 3] } }))).toBe(-3);
    expect(startValue(piece({ is: 'die', values: { list: ['sun', 'moon'] } }))).toBe('sun');
  });
});

describe('images and fields', () => {
  const tiled = piece({
    face: { image: { asset: 'sheet', tile: 'instance' } },
    flippable: { back: { image: 'back', labels: [{ field: 'flavour' }] } },
  });

  it('finds the images on both faces, with their paths', () => {
    expect(imageRefs(tiled)).toEqual([
      { ref: { asset: 'sheet', tile: 'instance' }, path: ['face', 'image'] },
      { ref: 'back', path: ['flippable', 'back', 'image'] },
    ]);
    expect(imageRefs(piece())).toEqual([]);
  });

  it('picks its own tile only when an image says `instance`', () => {
    expect(picksTile(tiled)).toBe(true);
    expect(picksTile(piece({ face: { image: { asset: 'sheet', tile: 2 } } }))).toBe(false);
    expect(picksTile(piece({ face: { image: 'sheet' } }))).toBe(false);
  });

  it('adds label fields as optional text, and `tile` when it picks one', () => {
    expect(
      componentFields(
        piece({
          face: {
            labels: [{ field: 'name' }, { text: 'Fixed' }],
            image: { asset: 'a', tile: 'instance' },
          },
          flippable: { back: { labels: [{ field: 'flavour' }] } },
        }),
      ),
    ).toEqual({
      name: { type: 'string', optional: true },
      flavour: { type: 'string', optional: true },
      tile: { type: 'int', optional: false, default: 0 },
    });
  });

  it('lets a declared field win over the one a label implies', () => {
    expect(
      componentFields(
        piece({ fields: { name: 'string', cost: 'int?' }, face: { labels: [{ field: 'name' }] } }),
      ),
    ).toEqual({
      name: { type: 'string', optional: false },
      cost: { type: 'int', optional: true },
    });
  });
});
