import { describe, expect, it } from 'vitest';
import type { ComponentType } from './schemas.js';
import { backFields } from './templates.js';

const card = (flippable: ComponentType['flippable']): ComponentType => ({
  id: 'card',
  size: [63, 88],
  is: 'piece',
  fields: { deck: 'string', title: 'string', tile: 'int', color: 'color' },
  face: { labels: [{ field: 'title' }] },
  flippable,
});

describe('backFields', () => {
  it('finds the fields a back is drawn with, once each', () => {
    const type = card({
      back: {
        fill: '{{color}}',
        image: { asset: 'backs', tile: 'instance' },
        labels: [{ field: 'deck' }, { text: '{{deck}}', when: '{{deck}}' }],
      },
    });
    expect(backFields(type).sort()).toEqual(['color', 'deck', 'tile']);
  });

  it('is empty for a plain back, or a component without one', () => {
    expect(backFields(card(true))).toEqual([]);
    expect(backFields(card({ back: { fill: 'red' } }))).toEqual([]);
    expect(backFields(card(undefined))).toEqual([]);
  });
});
