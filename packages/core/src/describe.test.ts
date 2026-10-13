import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { describeTable, queryObjects } from './describe.js';
import { TableEngine } from './engine.js';
import { createTable } from './setup.js';
import { checkIntegrity, type Piece, type Stack } from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

let project: ResolvedProject;
beforeAll(async () => {
  project = (await loadProject(example)).project!;
});
const engine = () =>
  new TableEngine(createTable(project, { name: 't', seed: 42, setup: false }), project.types);

describe('deal', () => {
  it('deals round-robin into piles, one undo step', () => {
    const e = engine();
    const before = (e.state.objects[DECK] as Stack).items;
    e.dispatch({
      type: 'deal',
      from: DECK,
      to: [
        [0, 200],
        [100, 200],
      ],
      count: 3,
      face: 'up',
    });
    const s = e.state;
    expect((s.objects[DECK] as Stack).items).toEqual(before.slice(0, 4));
    const piles = Object.values(s.objects).filter(
      (o): o is Stack => o.kind === 'stack' && o.id !== DECK,
    );
    expect(piles).toHaveLength(2);
    // First card off the top goes to the first position and ends at the bottom of its pile.
    const first = piles.find((p) => p.pos[0] === 0)!;
    expect(first.items).toEqual([before[9], before[7], before[5]]);
    expect(first.items.every((id) => (s.objects[id] as Piece).face === 'up')).toBe(true);
    expect(checkIntegrity(s)).toEqual([]);
    e.undo();
    expect((e.state.objects[DECK] as Stack).items).toEqual(before);
  });

  it('deals single cards as loose pieces and refuses to overdeal', () => {
    const e = engine();
    e.dispatch({
      type: 'deal',
      from: DECK,
      to: [
        [0, 200],
        [100, 200],
      ],
    });
    expect(queryObjects(e.state, project.types, { region: [-10, 190, 200, 20] })).toHaveLength(2);
    expect(() => e.dispatch({ type: 'deal', from: DECK, to: [[0, 0]], count: 9 })).toThrow(
      /needs 9/,
    );
  });
});

describe('describe and query', () => {
  it('hides face-down cards unless revealed', () => {
    const e = engine();
    const text = describeTable(e.state, project.types);
    expect(text).toContain('deck:actions: 10 × Action card (action-card, card), top face down');
    expect(text).not.toContain('Harvest');
    expect(text).toContain('coins: coins (counter), value 0');
    expect(describeTable(e.state, project.types, { reveal: true })).toContain('Harvest');
  });

  it('shows face-up data and filters by type, data and stack contents', () => {
    const e = engine();
    e.dispatch({ type: 'draw', from: DECK, to: [0, 300], face: 'up' });
    const [card] = queryObjects(e.state, project.types, {
      base: 'card',
      region: [-50, 250, 100, 100],
    });
    expect(card!.top.data).toMatchObject({ suit: expect.any(String) });
    expect(
      queryObjects(e.state, project.types, { type: 'worker', where: { color: 'red' } }),
    ).toHaveLength(5);
    const inside = queryObjects(e.state, project.types, { inside: DECK });
    expect(inside).toHaveLength(9);
    expect(inside[0]!.top.data).toBeUndefined();
    expect(inside[0]!.parent).toBe(DECK);
  });
});
