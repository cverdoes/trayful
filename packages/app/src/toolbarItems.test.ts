import type { ProjectView } from '@trayful/core';
import { describe, expect, it } from 'vitest';
import { useStore } from './store';
import { moreItems, selectionButtons } from './toolbarItems';

const view = { project: 'harvest-moon', table: 'table-1' } as ProjectView;
const noop = () => undefined;

describe('selectionButtons', () => {
  it('shows no buttons when nothing applies to the selection', () => {
    expect(selectionButtons({ lockLabel: 'Lock', layoutLabel: 'Fan' })).toEqual([]);
  });

  it('shows only the actions that apply, in toolbar order, with their current labels', () => {
    const buttons = selectionButtons({
      lockLabel: 'Unlock',
      layoutLabel: 'Spread',
      lock: noop,
      layout: noop,
      flip: noop,
    });
    expect(buttons.map((b) => [b.label, b.title, b.keys])).toEqual([
      ['Flip', undefined, 'F'],
      ['Spread', 'Spread the pile', 'V'],
      ['Unlock', undefined, 'L'],
    ]);
  });
});

describe('moreItems', () => {
  it('lets the host design, print and invite, with starting over set apart at the end', () => {
    const items = moreItems(view, true);
    expect(items.map((i) => [i.label, i.separated ?? false])).toEqual([
      ['Design components', false],
      ['Print and play', false],
      ['Invite players…', false],
      ['Start over…', true],
    ]);
    items[2]!.onSelect();
    expect(useStore.getState().inviteOpen).toBe(true);
  });

  it('only offers starting over to a guest', () => {
    expect(moreItems(view, false).map((i) => [i.label, i.separated])).toEqual([
      ['Start over…', false],
    ]);
  });
});
