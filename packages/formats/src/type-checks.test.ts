import { describe, expect, it } from 'vitest';
import { normalizeField } from './fields.js';
import type { ComponentType } from './schemas.js';
import { typeProblems } from './type-checks.js';

function problems(type: Partial<ComponentType>) {
  const full: ComponentType = { id: 't', base: 'card', size: 10, ...type };
  const fields = Object.fromEntries(
    Object.entries(full.fields ?? {}).map(([k, f]) => [k, normalizeField(f)]),
  );
  return typeProblems(full, fields);
}

describe('typeProblems', () => {
  it('finds nothing wrong with a plain card', () => {
    expect(problems({})).toEqual([]);
  });

  it('rejects keys that do not suit the primitive', () => {
    expect(problems({ base: 'meeple', back: {} })).toEqual([
      { path: ['back'], message: 'A meeple has one side, so it cannot have a "back".' },
    ]);
    expect(problems({ snap: [{ id: 's', area: { at: [0, 0], size: 5 } }] })).toEqual([
      { path: ['snap'], message: 'Only boards, tiles and zones can have snap targets.' },
    ]);
    expect(problems({ faces: [1, 2] })).toEqual([
      { path: ['faces'], message: '"faces" is only for dice.' },
    ]);
  });

  it('checks a counter range runs from low to high', () => {
    expect(problems({ range: [0, 9] })).toEqual([
      { path: ['range'], message: '"range" is only for counters.' },
    ]);
    expect(problems({ base: 'counter', range: [9, 0] })).toEqual([
      { path: ['range'], message: 'The minimum is larger than the maximum.' },
    ]);
  });

  it('refuses a fill given twice', () => {
    expect(problems({ fill: 'red', front: { fill: 'blue' } })).toEqual([
      { path: ['fill'], message: 'Use either "fill" or "front.fill", not both.' },
    ]);
  });

  it('checks defaults against their field', () => {
    expect(problems({ fields: { cost: { type: 'int', default: 'free' } } })).toEqual([
      { path: ['fields', 'cost', 'default'], message: 'Default value must be a number.' },
    ]);
  });

  it('wants one kind of spot per snap target, and unique target ids', () => {
    const grid = { origin: [0, 0] as [number, number], cols: 2, rows: 1, cell: 5 };
    expect(
      problems({
        base: 'board',
        snap: [
          { id: 'a', grid, points: [[0, 0]] },
          { id: 'a', grid },
        ],
      }),
    ).toEqual([
      { path: ['snap', 0], message: 'Give exactly one of "grid", "points" or "area".' },
      { path: ['snap', 1, 'id'], message: 'Snap target "a" is defined twice.' },
    ]);
  });

  it('finds placeholders that name no field, wherever they are in a face', () => {
    expect(
      problems({
        fields: { name: 'string' },
        fill: '{{colour}}',
        back: { stroke: '{{edge}}', layers: [{ text: '{{name}} {{title}}', when: '{{flag}}' }] },
      }),
    ).toEqual([
      { path: ['fill'], message: '"{{colour}}" is not a field of "t".' },
      { path: ['back', 'stroke'], message: '"{{edge}}" is not a field of "t".' },
      { path: ['back', 'layers', 0, 'text'], message: '"{{title}}" is not a field of "t".' },
      { path: ['back', 'layers', 0, 'when'], message: '"{{flag}}" is not a field of "t".' },
    ]);
  });
});
