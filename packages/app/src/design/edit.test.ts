import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  addLayer,
  assetPath,
  droppedImage,
  fieldFromSpec,
  fieldSpec,
  freeFieldName,
  getIn,
  layerLabel,
  layersOf,
  moveLayer,
  newLayer,
  parseDefault,
  parseValues,
  removeLayer,
  renameKey,
  setIn,
  twoSided,
  withFieldRenamed,
} from './edit';

const card = (fields: Partial<ComponentType> = {}): ComponentType => ({
  id: 'card',
  base: 'card',
  size: [63, 88],
  ...fields,
});

describe('setIn and getIn', () => {
  it('sets a value deep inside without changing the original', () => {
    const type = card({ front: { fill: '#fff' } });
    const next = setIn(type, ['front', 'layers'], [{ text: 'A' }]);
    expect(getIn(next, ['front', 'layers', 0, 'text'])).toBe('A');
    expect(type.front).toEqual({ fill: '#fff' });
    expect(next.front?.fill).toBe('#fff');
  });

  it('makes the objects and lists on the way', () => {
    expect(setIn({}, ['a', 0, 'b'], 1)).toEqual({ a: [{ b: 1 }] });
  });

  it('removes a key set to undefined, and the object it leaves empty', () => {
    const type = card({ front: { layers: [{ text: 'A', font: { size: 10 } }] } });
    const next = setIn(type, ['front', 'layers', 0, 'font', 'size'], undefined);
    expect(next.front?.layers?.[0]).toEqual({ text: 'A' });
    expect(setIn(card({ corner: 3 }), ['corner'], undefined)).not.toHaveProperty('corner');
  });

  it('removes an item from a list', () => {
    expect(setIn({ a: [1, 2, 3] }, ['a', 1], undefined)).toEqual({ a: [1, 3] });
  });

  it('keeps the order of keys when replacing one', () => {
    expect(Object.keys(setIn({ a: 1, b: 2 }, ['a'], 3))).toEqual(['a', 'b']);
  });

  it('finds nothing past a missing step', () => {
    expect(getIn(card(), ['front', 'layers', 0])).toBeUndefined();
    expect(getIn(card(), ['size', 0])).toBe(63);
  });
});

it('renames a key in place', () => {
  expect(Object.keys(renameKey({ a: 1, b: 2, c: 3 }, 'b', 'x'))).toEqual(['a', 'x', 'c']);
});

it('knows which primitives have a back', () => {
  expect(twoSided(card())).toBe(true);
  expect(twoSided(card({ base: 'meeple' }))).toBe(false);
});

describe('layers', () => {
  const text = newLayer('text', card());
  const shape = newLayer('shape', card());

  it('adds, moves and removes layers on one side', () => {
    let type = addLayer(addLayer(card(), 'front', text), 'front', shape);
    expect(layersOf(type, 'front')).toEqual([text, shape]);
    type = moveLayer(type, 'front', 0, 1);
    expect(layersOf(type, 'front')).toEqual([shape, text]);
    expect(moveLayer(type, 'front', 1, 1)).toBe(type);
    expect(moveLayer(type, 'front', 0, -1)).toBe(type);
    type = removeLayer(type, 'front', 0);
    expect(layersOf(type, 'front')).toEqual([text]);
    expect(removeLayer(type, 'front', 0).front).toBeUndefined();
    expect(layersOf(type, 'back')).toEqual([]);
  });

  it('starts an image layer on the first image field', () => {
    expect(newLayer('image', card())).toMatchObject({ image: '' });
    const art = card({ fields: { name: 'string', art: 'image?' } });
    expect(newLayer('image', art)).toMatchObject({ image: '{{art}}' });
  });

  it('labels each kind of layer', () => {
    expect(layerLabel(text)).toBe('Text Text');
    expect(layerLabel(shape)).toBe('Shape rect');
    expect(layerLabel({ image: '' })).toBe('Image (no file)');
  });
});

describe('fields', () => {
  it('reads short and long fields alike', () => {
    expect(fieldSpec('int?')).toEqual({ type: 'int', values: [], optional: true });
    expect(fieldSpec({ enum: ['a', 'b'], default: 'a' })).toMatchObject({
      type: 'enum',
      values: ['a', 'b'],
      optional: false,
      default: 'a',
    });
    expect(fieldSpec({})).toMatchObject({ type: 'string' });
  });

  it('writes a field the short way when it can', () => {
    expect(fieldFromSpec({ type: 'int', values: [], optional: true })).toBe('int?');
    expect(fieldFromSpec({ type: 'int', values: [], optional: false, default: 2 })).toEqual({
      type: 'int',
      default: 2,
    });
    expect(fieldFromSpec({ type: 'enum', values: [], optional: true })).toEqual({
      enum: ['a'],
      optional: true,
    });
    expect(
      fieldFromSpec({ type: 'string', values: [], optional: false, description: 'Shown' }),
    ).toEqual({ description: 'Shown' });
  });

  it('reads typed values and defaults by kind', () => {
    expect(parseValues('red, 2, , 1.5')).toEqual(['red', 2, 1.5]);
    const spec = (type: 'int' | 'bool' | 'enum' | 'string') => ({
      type,
      values: [],
      optional: false,
    });
    expect(parseDefault('3', spec('int'))).toBe(3);
    expect(parseDefault('x', spec('int'))).toBe('x');
    expect(parseDefault('true', spec('bool'))).toBe(true);
    expect(parseDefault('maybe', spec('bool'))).toBe('maybe');
    expect(parseDefault('2', spec('enum'))).toBe(2);
    expect(parseDefault('3', spec('string'))).toBe('3');
    expect(parseDefault(undefined, spec('int'))).toBeUndefined();
  });

  it('names a new field after the ones taken', () => {
    expect(freeFieldName(card())).toBe('field');
    expect(freeFieldName(card({ fields: { field: 'string', field2: 'int' } }))).toBe('field3');
  });
});

describe('dropped images', () => {
  it('are saved under the file’s name, made safe for a path', () => {
    expect(assetPath('Moon Art (final).JPEG')).toBe('assets/moon-art-final.jpg');
    expect(assetPath('???.png')).toBe('assets/image.png');
  });

  it('are centred where they land, keeping their shape, at most half the face', () => {
    expect(droppedImage('assets/a.png', [200, 100], [30, 40], [60, 90])).toEqual({
      image: 'assets/a.png',
      at: [15, 32.5],
      size: [30, 15],
    });
  });
});

it('renames a field and the templates that use it', () => {
  const type = card({
    fields: { title: 'string', cost: 'int' },
    front: { layers: [{ text: '{{title}} ({{cost}})', when: '{{title}}' }] },
  });
  const renamed = withFieldRenamed(type, 'title', 'heading');
  expect(Object.keys(renamed.fields!)).toEqual(['heading', 'cost']);
  expect(renamed.front?.layers?.[0]).toEqual({
    text: '{{heading}} ({{cost}})',
    when: '{{heading}}',
  });
});
