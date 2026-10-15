import type { Command, TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { actionsFor } from './actions';
import { after, exampleTable } from './testing';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

/** The actions for a selection, and the commands each one sends. */
function actions(selection: string[], on = table) {
  const sent: Command[] = [];
  const result = actionsFor(on, project.types, selection, (c) => sent.push(c));
  const run = (action: (() => void) | undefined) => {
    sent.length = 0;
    action?.();
    return [...sent];
  };
  return { ...result, run };
}

describe('actionsFor', () => {
  it('offers nothing for an empty or vanished selection', () => {
    const none = actions([]);
    expect([none.flip, none.lock, none.lockLabel]).toEqual([undefined, undefined, 'Lock']);
    expect(actions(['nope']).rotateLeft).toBeUndefined();
  });

  it('flips and rotates cards together', () => {
    const a = actions(['action-card.plough.1', 'action-card.raid.1']);
    expect(a.run(a.flip)).toEqual([
      { type: 'flip', ids: ['action-card.plough.1', 'action-card.raid.1'] },
    ]);
    expect(a.run(a.rotateRight)).toEqual([
      { type: 'rotate', ids: ['action-card.plough.1', 'action-card.raid.1'], steps: 1 },
    ]);
    expect(a.run(a.rotateLeft)[0]).toMatchObject({ steps: -1 });
    expect(a.shuffle).toBeUndefined();
  });

  it('does not flip meeples, nor move locked objects', () => {
    expect(actions(['worker.red.1']).flip).toBeUndefined();
    const board = actions(['main-board']);
    expect(board.rotateLeft).toBeUndefined();
    expect(board.lockLabel).toBe('Unlock');
    expect(board.run(board.lock)).toEqual([{ type: 'lock', ids: ['main-board'], locked: false }]);
  });

  it('shuffles, draws from and lays out a single pile', () => {
    const a = actions(['deck:actions']);
    expect(a.run(a.shuffle)).toEqual([{ type: 'shuffle', id: 'deck:actions' }]);
    expect(a.layoutLabel).toBe('Fan');
    expect(a.run(a.layout)).toEqual([{ type: 'layout', id: 'deck:actions', layout: 'fan' }]);
    const [draw] = a.run(a.draw);
    // Just to the right of the pile.
    expect(draw).toMatchObject({ type: 'draw', from: 'deck:actions' });
    expect((draw as { to: number[] }).to[0]).toBeGreaterThan(350);
  });

  it('cycles a pile through fan, spread and back', () => {
    const fanned = after(project, table, { type: 'layout', id: 'deck:actions', layout: 'fan' });
    expect(actions(['deck:actions'], fanned).layoutLabel).toBe('Spread');
    const spread = after(project, table, { type: 'layout', id: 'deck:actions', layout: 'spread' });
    expect(actions(['deck:actions'], spread).layoutLabel).toBe('Pile');
  });

  it('draws only with one pile selected', () => {
    const stacked = after(project, table, {
      type: 'stack',
      ids: ['action-card.raid.1'],
      onto: 'action-card.plough.1',
    });
    const piles = Object.values(stacked.objects).filter((o) => o.kind === 'stack');
    expect(piles.length).toBeGreaterThan(1);
    expect(
      actions(
        piles.map((p) => p.id),
        stacked,
      ).draw,
    ).toBeUndefined();
  });

  it('rolls dice', () => {
    const a = actions(['d6.1', 'd6.2']);
    expect(a.run(a.roll)).toEqual([
      { type: 'roll', id: 'd6.1' },
      { type: 'roll', id: 'd6.2' },
    ]);
  });

  it('counts a counter up and down from its value', () => {
    const a = actions(['coins']);
    expect(a.run(a.increment)).toEqual([{ type: 'setValue', id: 'coins', value: 1 }]);
    expect(a.run(a.decrement)).toEqual([{ type: 'setValue', id: 'coins', value: -1 }]);
    expect(actions(['d6.1']).increment).toBeUndefined();
  });
});
