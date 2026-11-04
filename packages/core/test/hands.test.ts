import { fileURLToPath } from 'node:url';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands.js';
import { describeTable } from './describe.js';
import { AliasBook, resolveAliases, viewFor, withoutOtherHands } from './privacy.js';
import { createTable } from './setup.js';
import {
  checkIntegrity,
  handCounts,
  handOf,
  type Piece,
  type Stack,
  type TableState,
} from './state.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

let project: ResolvedProject;
beforeAll(async () => {
  project = (await loadProject(example)).project!;
});

const fresh = () => createTable(project, { name: 'test', seed: 42, setup: false });
const run = (state: TableState, ...commands: Command[]) =>
  commands.reduce((s, c) => applyCommand(s, c, project.types), state);
let counter = 0;
const book = () => new AliasBook(() => String(++counter));

describe('hands', () => {
  it('deals cards into hands and keeps them off the table', () => {
    const state = run(fresh(), {
      type: 'deal',
      from: DECK,
      to: ['hand:alice', 'hand:bob'],
      count: 3,
    });
    expect(handCounts(state)).toEqual({ alice: 3, bob: 3 });
    expect((state.objects[DECK] as Stack).items).toHaveLength(4);
    expect(handOf(state, 'alice').every((p) => !p.parent && !p.snap)).toBe(true);
    expect(checkIntegrity(state)).toEqual([]);
    expect(describeTable(state, project.types)).not.toContain(handOf(state, 'alice')[0]!.id);
  });

  it('plays cards from a hand side by side, face up unless asked', () => {
    let state = run(fresh(), { type: 'draw', from: DECK, count: 2, to: 'hand:alice' });
    const [a, b] = handOf(state, 'alice');
    state = run(state, { type: 'move', ids: [a!.id, b!.id], to: [100, 100] });
    const [pa, pb] = [state.objects[a!.id] as Piece, state.objects[b!.id] as Piece];
    expect(pa).toMatchObject({ pos: [100, 100], face: 'up' });
    expect(pa.hand).toBeUndefined();
    expect(pb.pos[0]).toBeGreaterThan(100);

    state = run(state, { type: 'move', ids: [a!.id], to: 'hand:alice' });
    state = run(state, { type: 'move', ids: [a!.id], to: [0, 0], face: 'down' });
    expect(state.objects[a!.id]).toMatchObject({ face: 'down' });
  });

  it('plays a card from a hand onto a pile', () => {
    let state = run(fresh(), { type: 'draw', from: DECK, to: 'hand:bob' });
    const [card] = handOf(state, 'bob');
    state = run(state, { type: 'stack', ids: [card!.id], onto: DECK });
    expect((state.objects[DECK] as Stack).items.at(-1)).toBe(card!.id);
    expect((state.objects[card!.id] as Piece).hand).toBeUndefined();
    expect(checkIntegrity(state)).toEqual([]);
  });

  it('refuses locked pieces and table-only moves on hand pieces', () => {
    expect(() =>
      run(
        fresh(),
        { type: 'lock', ids: ['main-board'], locked: true },
        { type: 'move', ids: ['main-board'], to: 'hand:alice' },
      ),
    ).toThrow(/is locked/);
    const state = run(fresh(), { type: 'draw', from: DECK, to: 'hand:alice' });
    const [card] = handOf(state, 'alice');
    expect(() => run(state, { type: 'rotate', ids: [card!.id], steps: 1 })).toThrow(/hand/);
    expect(() => run(state, { type: 'move', ids: [card!.id], by: [1, 1] })).toThrow(/give "to"/);
    expect(() => run(state, { type: 'draw', from: DECK, to: 'hand:Not Valid' })).toThrow(/player/);
  });
});

describe('viewFor', () => {
  it('hides other hands, face-down cards and the random state', () => {
    const state = run(fresh(), {
      type: 'deal',
      from: DECK,
      to: ['hand:alice', 'hand:bob'],
      count: 2,
    });
    const aliases = book();
    const alice = viewFor(state, 'alice', aliases, project.types);
    const own = handOf(state, 'alice');
    const bobs = handOf(state, 'bob');
    expect(alice.objects[own[0]!.id]).toMatchObject({ hand: 'alice', data: own[0]!.data });
    for (const card of bobs) expect(alice.objects[card.id]).toBeUndefined();
    expect(alice.hands).toEqual({ alice: 2, bob: 2 });
    expect(alice.rng).toBe(0);

    // The deck's cards are face down: stand-in ids, no data.
    const deck = alice.objects[DECK] as Stack;
    for (const id of deck.items) {
      expect(id).toMatch(/^hidden-/);
      expect((alice.objects[id] as Piece).data).toBeUndefined();
    }
    const text = JSON.stringify(alice);
    for (const id of [...bobs.map((c) => c.id), ...(state.objects[DECK] as Stack).items])
      expect(text).not.toContain(`"${id}"`);
  });

  it('turns stand-in ids in commands back into real ones', () => {
    const state = fresh();
    const aliases = book();
    const view = viewFor(state, 'alice', aliases, project.types);
    const top = (view.objects[DECK] as Stack).items.at(-1)!;
    const command = resolveAliases({ type: 'take', id: top, to: [0, 0] }, aliases);
    expect(command.id).toBe((state.objects[DECK] as Stack).items.at(-1));
  });

  it('forgets stand-ins of cards that came into view or went into a hand', () => {
    const state = fresh();
    const aliases = book();
    const seen = (viewFor(state, 'alice', aliases, project.types).objects[DECK] as Stack).items;
    const [bottom, top, middle] = [seen[0], seen.at(-1), seen[1]];
    const real = (state.objects[DECK] as Stack).items;
    const [first, second] = [real[0], real[1]];
    const later = run(
      state,
      { type: 'draw', from: DECK, to: [0, 0], face: 'up' },
      { type: 'take', id: first!, to: 'hand:bob' },
    );
    aliases.prune(later);
    expect(aliases.resolve(top!)).toBeUndefined();
    expect(aliases.resolve(bottom!)).toBeUndefined();
    expect(aliases.resolve(middle!)).toBe(second);
    aliases.clear();
    expect(aliases.resolve(middle!)).toBeUndefined();
  });

  it('shows a peeking viewer everything but the other hands', () => {
    const state = run(fresh(), { type: 'deal', from: DECK, to: ['hand:alice', 'hand:bob'] });
    const view = withoutOtherHands(state, 'alice');
    expect(view.objects[handOf(state, 'alice')[0]!.id]).toBeDefined();
    expect(view.objects[handOf(state, 'bob')[0]!.id]).toBeUndefined();
    expect(view.hands).toEqual({ alice: 1, bob: 1 });
  });

  it('gives shuffled cards new stand-ins', () => {
    const state = fresh();
    const aliases = book();
    const before = (viewFor(state, 'alice', aliases, project.types).objects[DECK] as Stack).items;
    aliases.forget((state.objects[DECK] as Stack).items);
    const after = (viewFor(state, 'alice', aliases, project.types).objects[DECK] as Stack).items;
    expect(after.some((id) => before.includes(id))).toBe(false);
  });
});
