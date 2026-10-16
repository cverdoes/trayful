import type { TableState } from '@trayful/core';
import type { ResolvedProject } from '@trayful/formats';
import type { ComponentType } from '@trayful/formats/browser';
import { beforeAll, describe, expect, it } from 'vitest';
import { after, exampleTable } from '../testing';
import { dropTarget, typeOf, type Types } from './geometry';

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  ({ project, table } = await exampleTable());
});

/** The example's components, with one of them changed. */
function changed(id: string, changes: Partial<ComponentType>): Types {
  return { ...project.types, [id]: { ...project.types[id]!, ...changes } };
}

// The deck lies at [350, -130], the score markers at [-270, 170], worker.red.2 at [-244, 240].
const DECK: [number, number] = [350, -130];
const MARKERS: [number, number] = [-270, 170];

describe('typeOf', () => {
  it('is a piece’s own component, or that of the top piece of a stack', () => {
    expect(typeOf(table, project.types, table.objects['d6.1']!)?.id).toBe('d6');
    expect(typeOf(table, project.types, table.objects['deck:actions']!)?.id).toBe('action-card');
  });
});

describe('dropTarget', () => {
  const target = (
    dragged: string,
    point: [number, number],
    types: Types = project.types,
    on = table,
  ) => dropTarget(on, types, [dragged], point)?.id;

  it('stacks a component onto the same component under the point', () => {
    expect(target('action-card.raid.1', DECK)).toBe('deck:actions');
  });

  it('finds nothing for a component that does not stack, or away from anything', () => {
    expect(target('worker.red.1', [-244, 240])).toBeUndefined();
    expect(target('action-card.raid.1', [500, 500])).toBeUndefined();
  });

  it('does not stack different components unless one names the other in stackable.with', () => {
    expect(target('score-marker.red', DECK)).toBeUndefined();
    const marker = changed('score-marker', { stackable: { with: ['action-card'] } });
    expect(target('score-marker.red', DECK, marker)).toBe('deck:actions');
    const card = changed('action-card', { stackable: { with: ['score-marker'] } });
    expect(target('action-card.raid.1', MARKERS, card)).toMatch(/^score-marker\./);
  });

  it('needs both components stackable, even when one names the other', () => {
    const card = changed('action-card', { stackable: { with: ['worker'] } });
    expect(target('worker.red.1', DECK, card)).toBeUndefined();
  });

  it('does not stack onto a locked object', () => {
    const locked = after(project, table, { type: 'lock', ids: ['deck:actions'], locked: true });
    expect(target('action-card.raid.1', DECK, project.types, locked)).toBeUndefined();
  });
});
