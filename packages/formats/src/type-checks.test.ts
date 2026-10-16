import { describe, expect, it } from 'vitest';
import type { ComponentType } from './schemas.js';
import { typeProblems } from './type-checks.js';

function problems(type: Partial<ComponentType>) {
  return typeProblems({ id: 't', is: 'piece', size: 10, ...type });
}

describe('typeProblems', () => {
  it('finds nothing wrong with a plain card', () => {
    expect(problems({ flippable: true, rotates: true, stackable: true })).toEqual([]);
  });

  it('keeps behaviours to pieces and zones, and values to dice and counters', () => {
    expect(problems({ is: 'die', flippable: true, rotates: true })).toEqual([
      { path: ['flippable'], message: 'A die cannot have "flippable".' },
      { path: ['rotates'], message: 'A die cannot have "rotates".' },
    ]);
    expect(
      problems({ is: 'counter', stackable: true, container: [{ id: 'a', points: [[0, 0]] }] }),
    ).toEqual([
      { path: ['stackable'], message: 'A counter cannot have "stackable".' },
      { path: ['container'], message: 'A counter cannot have "container".' },
    ]);
    expect(problems({ values: { range: [1, 6] } })).toEqual([
      { path: ['values'], message: 'Only dice and counters have values.' },
    ]);
  });

  it('checks values are a range from low to high, or a list', () => {
    expect(problems({ is: 'counter', values: { range: [9, 0] } })).toEqual([
      { path: ['values', 'range'], message: 'The minimum is larger than the maximum.' },
    ]);
    expect(problems({ is: 'die', values: { range: [1, 2], list: ['a', 'b'] } })).toEqual([
      { path: ['values'], message: 'Give either "range" or "list", not both.' },
    ]);
    expect(problems({ is: 'die', values: { list: ['a', 'b'], controls: ['roll'] } })).toEqual([]);
  });

  it('checks defaults against their field', () => {
    expect(problems({ fields: { cost: { type: 'int', default: 'free' } } })).toEqual([
      { path: ['fields', 'cost', 'default'], message: 'Default value must be a number.' },
    ]);
  });

  it('wants one kind of spot per drop area, and unique area ids', () => {
    const grid = { origin: [0, 0] as [number, number], cols: 2, rows: 1, cell: 5 };
    expect(
      problems({
        container: [
          { id: 'a', grid, points: [[0, 0]] },
          { id: 'a', grid },
        ],
      }),
    ).toEqual([
      { path: ['container', 0], message: 'Give exactly one of "grid", "points" or "area".' },
      { path: ['container', 1, 'id'], message: 'Drop area "a" is defined twice.' },
    ]);
  });

  it('wants a mode that suits spots or an area', () => {
    const area = { at: [0, 0] as [number, number], size: 10 };
    expect(
      problems({
        container: [
          { id: 'a', points: [[0, 0]], mode: 'bag' },
          { id: 'b', area, mode: 'pile' },
          { id: 'c', points: [[0, 0]], mode: 'pile' },
          { id: 'd', area, mode: 'row' },
        ],
      }),
    ).toEqual([
      { path: ['container', 0, 'mode'], message: "Spots' mode is one of single, pile." },
      { path: ['container', 1, 'mode'], message: "An area's mode is one of free, row, bag." },
    ]);
  });

  it('wants a label to give one of text and field', () => {
    expect(
      problems({
        face: { labels: [{ at: [1, 1] }, { text: 'x', field: 'name' }, { field: 'name' }] },
      }),
    ).toEqual([
      { path: ['face', 'labels', 0], message: 'Give one of "text" or "field".' },
      { path: ['face', 'labels', 1], message: 'Give one of "text" or "field".' },
    ]);
  });

  it('checks how a face image picks its tile', () => {
    expect(problems({ face: { image: { asset: 'sheet', row: 1 } } })).toEqual([
      { path: ['face', 'image'], message: 'Give both "row" and "col".' },
    ]);
    expect(
      problems({ flippable: { back: { image: { asset: 'sheet', row: 1, col: 0, tile: 2 } } } }),
    ).toEqual([
      {
        path: ['flippable', 'back', 'image'],
        message: 'Give either "tile" or "row" and "col", not both.',
      },
    ]);
    expect(problems({ face: { image: { asset: 'sheet', tile: 'value' } } })).toEqual([
      {
        path: ['face', 'image', 'tile'],
        message: 'Only dice and counters show their value as a tile.',
      },
    ]);
    expect(problems({ is: 'die', face: { image: { asset: 'pips', tile: 'value' } } })).toEqual([]);
    expect(problems({ face: { image: 'sheet' } })).toEqual([]);
  });

  it('finds placeholders that name no field, wherever they are in a face', () => {
    expect(
      problems({
        fields: { name: 'string' },
        face: {
          fill: '{{colour}}',
          labels: [{ text: '{{name}} {{who}}', color: '{{ink}}', when: '{{shown}}' }],
        },
        flippable: {
          back: {
            stroke: '{{edge}}',
            layers: [{ text: '{{name}} {{title}}', when: '{{flag}}' }],
          },
        },
      }),
    ).toEqual([
      { path: ['face', 'fill'], message: '"{{colour}}" is not a field of "t".' },
      { path: ['face', 'labels', 0, 'text'], message: '"{{who}}" is not a field of "t".' },
      { path: ['face', 'labels', 0, 'color'], message: '"{{ink}}" is not a field of "t".' },
      { path: ['face', 'labels', 0, 'when'], message: '"{{shown}}" is not a field of "t".' },
      { path: ['flippable', 'back', 'stroke'], message: '"{{edge}}" is not a field of "t".' },
      {
        path: ['flippable', 'back', 'layers', 0, 'text'],
        message: '"{{title}}" is not a field of "t".',
      },
      {
        path: ['flippable', 'back', 'layers', 0, 'when'],
        message: '"{{flag}}" is not a field of "t".',
      },
    ]);
  });

  it('counts a label field as a field of the component', () => {
    expect(problems({ face: { labels: [{ field: 'title' }, { text: '{{title}}!' }] } })).toEqual(
      [],
    );
  });
});
