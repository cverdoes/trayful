import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import {
  addItem,
  assetPath,
  canMove,
  editType,
  fieldFromSpec,
  fieldSpec,
  freeFieldName,
  getIn,
  itemLabel,
  itemsOf,
  layersOf,
  moveItem,
  newLabel,
  newLayer,
  parseDefault,
  parseValues,
  removeItem,
  renameKey,
  setIn,
  sideOf,
  sidePath,
  twoSided,
  withFieldRenamed,
  withItem,
  withRepresentation,
} from './edit';

const card = (fields: Partial<ComponentType> = {}): ComponentType => ({
  id: 'card',
  is: 'piece',
  size: [63, 88],
  ...fields,
});

describe('setIn and getIn', () => {
  it('sets a value deep inside without changing the original', () => {
    const type = card({ face: { fill: '#fff' } });
    const next = setIn(type, ['face', 'layers'], [{ text: 'A' }]);
    expect(getIn(next, ['face', 'layers', 0, 'text'])).toBe('A');
    expect(type.face).toEqual({ fill: '#fff' });
    expect(next.face?.fill).toBe('#fff');
  });

  it('makes the objects and lists on the way', () => {
    expect(setIn({}, ['a', 0, 'b'], 1)).toEqual({ a: [{ b: 1 }] });
  });

  it('removes a key set to undefined, and the object it leaves empty', () => {
    const type = card({ face: { layers: [{ text: 'A', font: { size: 10 } }] } });
    const next = setIn(type, ['face', 'layers', 0, 'font', 'size'], undefined);
    expect(next.face?.layers?.[0]).toEqual({ text: 'A' });
    expect(setIn(card({ face: { corner: 3 } }), ['face', 'corner'], undefined)).not.toHaveProperty(
      'face',
    );
  });

  it('removes an item from a list', () => {
    expect(setIn({ a: [1, 2, 3] }, ['a', 1], undefined)).toEqual({ a: [1, 3] });
  });

  it('keeps the order of keys when replacing one', () => {
    expect(Object.keys(setIn({ a: 1, b: 2 }, ['a'], 3))).toEqual(['a', 'b']);
  });

  it('finds nothing past a missing step', () => {
    expect(getIn(card(), ['face', 'layers', 0])).toBeUndefined();
    expect(getIn(card(), ['size', 0])).toBe(63);
  });
});

it('renames a key in place', () => {
  expect(Object.keys(renameKey({ a: 1, b: 2, c: 3 }, 'b', 'x'))).toEqual(['a', 'x', 'c']);
});

describe('sides', () => {
  it('has a back to design only when the component flips', () => {
    expect(twoSided(card())).toBe(false);
    expect(twoSided(card({ flippable: true }))).toBe(true);
  });

  it('keeps the front in the face and the back under flippable', () => {
    const type = card({ face: { fill: 'red' }, flippable: { back: { fill: 'blue' } } });
    expect(sidePath('front')).toEqual(['face']);
    expect(sidePath('back')).toEqual(['flippable', 'back']);
    expect(sideOf(type, 'front')).toEqual({ fill: 'red' });
    expect(sideOf(type, 'back')).toEqual({ fill: 'blue' });
    expect(sideOf(card({ flippable: true }), 'back')).toBeUndefined();
  });
});

describe('editType', () => {
  it('keeps a behaviour on when an edit empties its settings', () => {
    const turning = card({ rotates: { step: 45 } });
    expect(editType(turning, ['rotates', 'step'], undefined).rotates).toBe(true);
    const flipping = card({ flippable: { back: { fill: 'blue' } } });
    expect(editType(flipping, ['flippable', 'back', 'fill'], undefined).flippable).toBe(true);
  });

  it('turns a behaviour off when it is cleared itself', () => {
    expect(editType(card({ stackable: true }), ['stackable'], undefined)).not.toHaveProperty(
      'stackable',
    );
  });

  it('turns a behaviour on with the first setting written', () => {
    expect(editType(card(), ['stackable', 'with'], ['coin']).stackable).toEqual({
      with: ['coin'],
    });
  });

  it('drops the behaviours a new kind of thing cannot have', () => {
    const flipping = card({ flippable: true, rotates: true, container: [], face: { fill: 'red' } });
    expect(withRepresentation(flipping, 'die')).toEqual({
      ...card({ face: { fill: 'red' } }),
      is: 'die',
    });
    const die = card({ is: 'die', values: { range: [1, 4] } });
    expect(withRepresentation(die, 'zone')).toEqual(card({ is: 'zone' }));
  });

  it('tidies away other objects an edit empties', () => {
    expect(editType(card({ face: { fill: 'red' } }), ['face', 'fill'], undefined)).toEqual(card());
  });
});

describe('layers and labels', () => {
  const text = newLayer('text', card());
  const shape = newLayer('shape', card());
  const label = { text: 'Hi', at: [1, 2] as [number, number] };

  it('lists a side’s layers, then its labels drawn as text', () => {
    const type = card({
      face: { layers: [shape], labels: [label, { field: 'cost', at: [0, 0] }] },
    });
    expect(itemsOf(type, 'front').map((item) => item.path)).toEqual([
      ['face', 'layers', 0],
      ['face', 'labels', 0],
      ['face', 'labels', 1],
    ]);
    expect(layersOf(type, 'front')).toEqual([
      shape,
      { text: 'Hi', at: [1, 2] },
      { text: '{{cost}}', at: [0, 0] },
    ]);
    expect(layersOf(card({ face: { labels: [{ at: [0, 0] }] } }), 'front')).toEqual([
      { text: '', at: [0, 0] },
    ]);
  });

  it('adds, moves and removes layers on one side', () => {
    let { type, index } = addItem(card(), 'front', { layer: text });
    expect(index).toBe(0);
    ({ type, index } = addItem(type, 'front', { layer: shape }));
    expect(index).toBe(1);
    expect(layersOf(type, 'front')).toEqual([text, shape]);
    type = moveItem(type, 'front', 0, 1);
    expect(layersOf(type, 'front')).toEqual([shape, text]);
    expect(moveItem(type, 'front', 1, 1)).toBe(type);
    expect(moveItem(type, 'front', 0, -1)).toBe(type);
    type = removeItem(type, 'front', 0);
    expect(layersOf(type, 'front')).toEqual([text]);
    expect(removeItem(type, 'front', 0).face).toBeUndefined();
    expect(removeItem(type, 'front', 5)).toBe(type);
    expect(layersOf(type, 'back')).toEqual([]);
  });

  it('adds a layer before the labels, and a label after them', () => {
    const labelled = card({ face: { labels: [label] } });
    const withLayer = addItem(labelled, 'front', { layer: shape });
    expect(withLayer.index).toBe(0);
    expect(itemsOf(withLayer.type, 'front')[0]?.layer).toEqual(shape);
    const withLabel = addItem(withLayer.type, 'front', { label: { text: 'Two' } });
    expect(withLabel.index).toBe(2);
    expect(withLabel.type.face?.labels).toEqual([label, { text: 'Two' }]);
  });

  it('puts the back’s items on the flippable back', () => {
    const { type } = addItem(card({ flippable: true }), 'back', { label });
    expect(type.flippable).toEqual({ back: { labels: [label] } });
    expect(itemsOf(type, 'back')[0]?.path).toEqual(['flippable', 'back', 'labels', 0]);
    expect(removeItem(type, 'back', 0).flippable).toBe(true);
  });

  it('moves an item only among its own kind', () => {
    const type = card({ face: { layers: [text, shape], labels: [label, { text: 'B' }] } });
    expect(canMove(type, 'front', 0, 1)).toBe(true);
    expect(canMove(type, 'front', 1, 1)).toBe(false);
    expect(canMove(type, 'front', 2, -1)).toBe(false);
    expect(canMove(type, 'front', 2, 1)).toBe(true);
    expect(canMove(type, 'front', 3, 1)).toBe(false);
    expect(moveItem(type, 'front', 1, 1)).toBe(type);
    expect(moveItem(type, 'front', 2, 1).face?.labels).toEqual([{ text: 'B' }, label]);
  });

  it('writes a moved layer back as a label, keeping its field', () => {
    const type = card({ face: { labels: [label, { field: 'cost', at: [0, 0] }] } });
    const [fixed, field] = itemsOf(type, 'front');
    const moved = withItem(type, fixed!, { ...fixed!.layer, at: [9, 9] });
    expect(moved.face?.labels?.[0]).toEqual({ text: 'Hi', at: [9, 9] });
    const turned = withItem(type, field!, { ...field!.layer, rotate: 90 });
    expect(turned.face?.labels?.[1]).toEqual({ field: 'cost', at: [0, 0], rotate: 90 });
    const layered = card({ face: { layers: [shape] } });
    const [item] = itemsOf(layered, 'front');
    expect(withItem(layered, item!, { ...shape, at: [1, 1] }).face?.layers).toEqual([
      { ...shape, at: [1, 1] },
    ]);
  });

  it('starts an image layer on the first image field', () => {
    expect(newLayer('image', card())).toMatchObject({ image: '' });
    const art = card({ fields: { name: 'string', art: 'image?' } });
    expect(newLayer('image', art)).toMatchObject({ image: '{{art}}' });
  });

  it('starts a label on the first field, or as fixed text', () => {
    expect(newLabel(card())).toEqual({ text: 'Label', at: [5, 5] });
    expect(newLabel(card({ fields: { cost: 'int' } }))).toEqual({ field: 'cost', at: [5, 5] });
  });

  it('names each kind of item', () => {
    const type = card({
      face: {
        layers: [text, shape, { image: '' }, { image: 'art' }],
        labels: [label, { field: 'cost' }],
      },
    });
    expect(itemsOf(type, 'front').map(itemLabel)).toEqual([
      'Text Text',
      'Shape rect',
      'Image (no file)',
      'Image art',
      'Label Hi',
      'Label {{cost}}',
    ]);
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
});

it('renames a field and the templates that use it', () => {
  const type = card({
    fields: { title: 'string', cost: 'int' },
    face: {
      layers: [{ text: '{{title}} ({{cost}})', when: '{{title}}' }],
      labels: [{ field: 'title' }, { field: 'cost' }],
    },
    flippable: { back: { labels: [{ field: 'title', when: '{{title}}' }] } },
  });
  const renamed = withFieldRenamed(type, 'title', 'heading');
  expect(Object.keys(renamed.fields!)).toEqual(['heading', 'cost']);
  expect(renamed.face?.layers?.[0]).toEqual({
    text: '{{heading}} ({{cost}})',
    when: '{{heading}}',
  });
  expect(renamed.face?.labels).toEqual([{ field: 'heading' }, { field: 'cost' }]);
  expect(sideOf(renamed, 'back')?.labels).toEqual([{ field: 'heading', when: '{{heading}}' }]);
});
