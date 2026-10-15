import { describe, expect, it } from 'vitest';
import { freeTypeId, sameValue, TYPE_PRESETS, typeDraftProblems } from './presets.js';

describe('TYPE_PRESETS', () => {
  it('are all valid types once they have an id', () => {
    for (const preset of TYPE_PRESETS) {
      expect(typeDraftProblems({ id: 'x', ...preset.type }), preset.name).toEqual([]);
    }
  });
});

describe('freeTypeId', () => {
  it('makes an id from a name, numbering it when the id is taken', () => {
    expect(freeTypeId('Event Card', [])).toBe('event-card');
    expect(freeTypeId('Event Card', ['event-card', 'event-card-2'])).toBe('event-card-3');
    expect(freeTypeId('!!', [])).toBe('type');
  });
});

describe('typeDraftProblems', () => {
  it('points at the value that causes each problem', () => {
    expect(typeDraftProblems({ id: 'c', base: 'card', size: 'big' })).toEqual([
      { path: ['size'], message: expect.any(String) },
    ]);
    expect(typeDraftProblems({ id: 'm', base: 'meeple', size: 16, back: {} })).toEqual([
      { path: ['back'], message: 'A meeple has one side, so it cannot have a "back".' },
    ]);
    expect(
      typeDraftProblems({
        id: 'c',
        base: 'card',
        size: [63, 88],
        front: { layers: [{ text: '{{title}}' }] },
      }),
    ).toEqual([
      { path: ['front', 'layers', 0, 'text'], message: expect.stringContaining('title') },
    ]);
  });
});

it('compares values whatever order their keys are in', () => {
  expect(
    sameValue({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }),
  ).toBe(true);
  expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  expect(sameValue([1, 2], [2, 1])).toBe(false);
  expect(sameValue({ a: 1 }, { a: '1' })).toBe(false);
});
