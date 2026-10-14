import { fileURLToPath } from 'node:url';
import { loadProject, type ComponentSpec, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTable } from './setup.js';
import { checkIntegrity, type Piece, type Stack, type TableState } from './state.js';
import { syncTable } from './sync.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

let project: ResolvedProject;
let table: TableState;

beforeAll(async () => {
  const result = await loadProject(example);
  if (!result.project) throw new Error('example project failed to load');
  project = result.project;
  table = createTable(project, { name: 'test', seed: 42, setup: false });
});

const withComponents = (components: ComponentSpec[]) => ({ ...project, components });
const without = (prefix: string) =>
  withComponents(project.components.filter((c) => !c.id.startsWith(prefix)));
const deck = (s: TableState) => s.objects['deck:actions'] as Stack | undefined;

describe('syncTable', () => {
  it('returns the same table when nothing changed', () => {
    expect(syncTable(table, project)).toBe(table);
  });

  it('takes pieces whose component is gone off the table and out of their deck', () => {
    const synced = syncTable(table, without('action-card.harvest'));
    expect(synced.objects['action-card.harvest.1']).toBeUndefined();
    expect(deck(synced)!.items).toHaveLength(deck(table)!.items.length - 3);
    expect(checkIntegrity(synced)).toEqual([]);
    expect(deck(syncTable(table, without('action-card')))).toBeUndefined();
  });

  it("gives pieces their component's current type and data", () => {
    const components = project.components.map((c) => {
      if (c.id === 'action-card.raid.1') return { ...c, data: { ...c.data, cost: 9 } };
      if (c.id === 'coins') return { ...c, data: { note: 'gold' } };
      return c;
    });
    const synced = syncTable(table, withComponents(components));
    expect((synced.objects['action-card.raid.1'] as Piece).data?.cost).toBe(9);
    expect((synced.objects.coins as Piece).data).toEqual({ note: 'gold' });
    const cleared = syncTable(synced, project);
    expect((cleared.objects.coins as Piece).data).toBeUndefined();
  });

  it('puts new cards at the bottom of their deck, and new pieces below everything', () => {
    const card = { id: 'action-card.new', type: 'action-card', data: {}, deck: 'actions' };
    const coin = { id: 'coins.2', type: 'coins', data: {} };
    const ghost = { id: 'ghost', type: 'no-such-type', data: {} };
    const synced = syncTable(table, withComponents([...project.components, card, coin, ghost]));
    expect(deck(synced)!.items[0]).toBe(card.id);
    const lowest = Math.max(
      ...Object.values(table.objects)
        .filter((o) => !(o.kind === 'piece' && o.parent))
        .map((o) => o.pos[1]),
    );
    expect((synced.objects['coins.2'] as Piece).pos[1]).toBeGreaterThan(lowest);
    expect(synced.objects.ghost).toBeUndefined();
    expect(checkIntegrity(synced)).toEqual([]);
  });

  it('starts a new pile for a card whose deck is no longer on the table', () => {
    const empty = { ...table, objects: {} };
    const card = { id: 'action-card.new', type: 'action-card', data: {}, deck: 'events' };
    const synced = syncTable(empty, withComponents([card]));
    expect(synced.objects['deck:events']).toMatchObject({ kind: 'stack', items: [card.id] });
    expect((synced.objects[card.id] as Piece).parent).toBe('deck:events');
  });
});
