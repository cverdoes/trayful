import type { Activity, Command, TableView } from '@trayful/core';
import { describe, expect, it } from 'vitest';
import { activityFor, activityText, motionOf } from './activity.js';

describe('activityText', () => {
  it('says what a command did without naming any piece', () => {
    const cases: [Command, string][] = [
      [{ type: 'move', ids: ['a', 'b'], by: [1, 1] }, 'moved 2 pieces'],
      [{ type: 'flip', ids: ['a'] }, 'flipped 1 piece'],
      [{ type: 'rotate', ids: ['a'], steps: 1 }, 'turned 1 piece'],
      [{ type: 'stack', ids: ['a', 'b'], onto: 'c' }, 'stacked 2 pieces'],
      [{ type: 'draw', from: 'deck', to: [0, 0] }, 'drew 1 piece'],
      [{ type: 'draw', from: 'sack/bag', to: 'hand:bo' }, 'drew 1 piece from a bag into a hand'],
      [{ type: 'deal', from: 'deck', to: [[0, 0]], count: 3 }, 'dealt 3 pieces each'],
      [{ type: 'take', id: 'a', to: [0, 0] }, 'took a piece from a pile'],
      [{ type: 'layout', id: 'deck', layout: 'fan' }, 'spread out a pile'],
      [{ type: 'shuffle', id: 'deck' }, 'shuffled a pile'],
      [{ type: 'roll', id: 'd6' }, 'rolled'],
      [{ type: 'setValue', id: 'coins', value: 3 }, 'set a value'],
      [{ type: 'lock', ids: ['a'], locked: false }, 'unlocked 1 piece'],
      [{ type: 'other' } as unknown as Command, 'changed the table'],
    ];
    for (const [command, text] of cases) expect(activityText(command)).toBe(text);
  });

  it('names whose hand pieces went into', () => {
    const whose = (player: string) => (player === 'ann' ? 'their' : `${player}'s`);
    expect(activityText({ type: 'move', ids: ['a'], to: 'hand:ann' }, whose)).toBe(
      'moved 1 piece into their hand',
    );
    expect(activityText({ type: 'draw', from: 'deck', count: 2, to: 'hand:bo' }, whose)).toBe(
      "drew 2 pieces into bo's hand",
    );
    expect(activityText({ type: 'take', id: 'a', to: 'hand:bo' })).toBe(
      'took a piece from a pile into a hand',
    );
  });
});

describe('motionOf', () => {
  it('has tables show the dice that were rolled tumble', () => {
    expect(
      motionOf([
        { type: 'roll', id: 'd6.1' },
        { type: 'flip', ids: ['a'] },
        { type: 'roll', id: 'd6.2' },
      ]),
    ).toEqual({ kind: 'roll', ids: ['d6.1', 'd6.2'] });
    expect(motionOf([{ type: 'shuffle', id: 'deck' }])).toBeUndefined();
  });
});

describe('activityFor', () => {
  const view = { objects: { 'd6.1': {} } } as unknown as TableView;

  it('shows each viewer only the rolls of pieces they can see', () => {
    const rolled = {
      by: 'person',
      text: 'rolled',
      motion: { kind: 'roll', ids: ['d6.1', 'd6.2'] },
    };
    expect(activityFor(rolled as Activity, view).motion).toEqual({ kind: 'roll', ids: ['d6.1'] });
    const hidden = { ...rolled, motion: { kind: 'roll', ids: ['d6.2'] } } as Activity;
    expect(activityFor(hidden, view)).toEqual({ by: 'person', text: 'rolled' });
  });
});
