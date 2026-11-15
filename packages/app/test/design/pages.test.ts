import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { itemsSummary, pageFor } from '../../src/design/pages';

const board: ComponentType = {
  id: 'board',
  is: 'piece',
  size: [100, 100],
  face: {
    layers: [{ shape: 'circle', at: [5, 5], size: [10, 10] }],
    labels: [
      { field: 'name', at: [0, 0] },
      { text: 'Score', at: [0, 10] },
    ],
  },
  flippable: { back: { labels: [{ text: 'Back', at: [0, 0] }] } },
  container: [{ id: 'market', area: { at: [0, 0], size: [50, 50] } }],
};

describe('pageFor', () => {
  it('opens the drop areas for a selected drop area', () => {
    expect(pageFor(board, { side: 'front', target: 0 })).toEqual({ kind: 'drop-areas' });
  });

  it('opens a side’s labels for a label, and its drawing for any other layer', () => {
    expect(pageFor(board, { side: 'front', layer: 1 })).toEqual({ kind: 'labels', side: 'front' });
    expect(pageFor(board, { side: 'front', layer: 0 })).toEqual({ kind: 'drawing', side: 'front' });
    expect(pageFor(board, { side: 'back', layer: 0 })).toEqual({ kind: 'labels', side: 'back' });
  });

  it('has no page for nothing selected, or a layer that is gone', () => {
    expect(pageFor(board, { side: 'front' })).toBeUndefined();
    expect(pageFor(board, { side: 'front', layer: 9 })).toBeUndefined();
  });
});

describe('itemsSummary', () => {
  it('names labels by their field or text, and other layers by what they draw', () => {
    expect(itemsSummary(board, 'front', true)).toEqual(['name', 'Score']);
    expect(itemsSummary(board, 'front', false)).toEqual(['shape circle']);
    expect(itemsSummary(board, 'back', false)).toEqual([]);
  });
});
