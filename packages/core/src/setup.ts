import {
  FORMAT_VERSION,
  PRIMITIVE_INFO,
  type ComponentType,
  type SetupStep,
  type Vec2,
} from '@trayful/formats/browser';
import type { ResolvedProject } from '@trayful/formats';
import { applyCommand, CommandError, type Command } from './commands.js';
import { objectSize } from './layout.js';
import { seedState } from './rng.js';
import { resolveSpots, SnapError } from './snap.js';
import { sizeOf, type Piece, type TableObject, type TableState } from './state.js';

export interface CreateTableOptions {
  name: string;
  seed?: number;
  /**
   * Setup to start from, by name. Default: the manifest's `setup`. `false` starts
   * with everything laid out in rows, straight out of the box.
   */
  setup?: string | false;
}

export class SetupError extends Error {}

const BOX_WIDTH = 1200;
const GAP = 10;
/** Space between a setup's layout and the leftover components below it. */
const MARGIN = 40;

/**
 * Creates a table: every component from the inventory comes out of the box,
 * decks as face-down stacks and everything else in rows, and then the setup
 * (if any) arranges it. Components the setup does not use wait below it.
 */
export function createTable(project: ResolvedProject, options: CreateTableOptions): TableState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const state = outOfTheBox(project, options.name, seed);
  const name = options.setup === undefined ? project.manifest.setup : options.setup || undefined;
  if (name === undefined) return state;
  if (!project.setups[name]) {
    const known = Object.keys(project.setups);
    throw new SetupError(
      `Unknown setup "${name}". ${known.length ? `Known setups: ${known.join(', ')}.` : 'The project has no setups.'}`,
    );
  }
  return applySetup(state, project, name);
}

function outOfTheBox(project: ResolvedProject, name: string, seed: number): TableState {
  const objects: Record<string, TableObject> = {};
  const sized: { id: string; size: Vec2 }[] = [];
  let z = 0;
  const decks = new Set<string>();
  for (const spec of project.components) {
    const type = project.types[spec.type]!;
    if (spec.deck) {
      if (decks.has(spec.deck)) continue;
      decks.add(spec.deck);
      // Decks list their top card first; stacks store bottom to top.
      const ids = [...project.decks[spec.deck]!].reverse();
      const stackId = `deck:${spec.deck}`;
      for (const id of ids) {
        const member = project.components.find((c) => c.id === id)!;
        objects[id] = newPiece(
          member.id,
          project.types[member.type]!,
          member.data,
          'down',
          stackId,
        );
      }
      objects[stackId] = {
        kind: 'stack',
        id: stackId,
        name: spec.deck,
        pos: [0, 0],
        rot: 0,
        z: z++,
        items: ids,
      };
      sized.push({ id: stackId, size: sizeOf(type) });
      continue;
    }
    objects[spec.id] = { ...newPiece(spec.id, type, spec.data, 'up'), z: z++ };
    sized.push({ id: spec.id, size: sizeOf(type) });
  }
  for (const [id, pos] of rows(sized, [0, 0], BOX_WIDTH)) {
    objects[id] = { ...objects[id]!, pos };
  }
  return { format: FORMAT_VERSION, table: name, seed, rng: seedState(seed), objects };
}

function newPiece(
  id: string,
  type: ComponentType,
  data: Record<string, string | number | boolean>,
  face: 'up' | 'down',
  parent?: string,
): Piece {
  const piece: Piece = { kind: 'piece', id, type: type.id, data, pos: [0, 0], rot: 0, face, z: 0 };
  if (Object.keys(data).length === 0) delete piece.data;
  if (parent) piece.parent = parent;
  if (type.base === 'board') piece.locked = true;
  if (type.base === 'counter') piece.value = type.range?.[0] ?? 0;
  if (type.base === 'die') piece.value = type.faces?.[0] ?? 1;
  if (PRIMITIVE_INFO[type.base].sides === 1) piece.face = 'up';
  return piece;
}

/** Lays objects out left to right in rows no wider than `width`, from `origin` (a top-left corner). */
function rows(items: { id: string; size: Vec2 }[], origin: Vec2, width: number): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  let cursor: Vec2 = [0, 0];
  let rowHeight = 0;
  for (const { id, size } of items) {
    if (cursor[0] > 0 && cursor[0] + size[0] > width) {
      cursor = [0, cursor[1] + rowHeight + GAP];
      rowHeight = 0;
    }
    out.set(id, [origin[0] + cursor[0] + size[0] / 2, origin[1] + cursor[1] + size[1] / 2]);
    cursor = [cursor[0] + size[0] + GAP, cursor[1]];
    rowHeight = Math.max(rowHeight, size[1]);
  }
  return out;
}

/**
 * Runs a setup's steps on a table fresh out of the box. Each step goes through
 * the same commands people and agents use, so snapping and dealing behave the same.
 */
export function applySetup(
  initial: TableState,
  project: ResolvedProject,
  name: string,
): TableState {
  const setup = project.setups[name];
  if (!setup) throw new SetupError(`Unknown setup "${name}".`);
  const catalog = project.types;
  let state = initial;
  const used = new Set<string>();
  const run = (command: Command) => {
    state = applyCommand(state, command, catalog);
  };
  const edit = (id: string, changes: Partial<TableObject>) => {
    const next = { ...state.objects[id]!, ...changes } as TableObject;
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
    }
    state = { ...state, objects: { ...state.objects, [id]: next } };
  };
  const topLevel = () =>
    new Set(
      Object.values(state.objects)
        .filter((o) => !(o.kind === 'piece' && o.parent))
        .map((o) => o.id),
    );

  setup.steps.forEach((step, i) => {
    try {
      const before = topLevel();
      runStep(step);
      for (const id of topLevel()) if (!before.has(id)) used.add(id);
    } catch (error) {
      if (
        error instanceof CommandError ||
        error instanceof SnapError ||
        error instanceof SetupError
      )
        throw new SetupError(`Setup "${name}", step ${i + 1}: ${error.message}`);
      throw error;
    }
  });

  function runStep(step: SetupStep): void {
    if (!('place' in step) && !('deal' in step)) {
      run({ type: 'shuffle', id: deckId(step.shuffle) });
      return;
    }
    if ('deal' in step) {
      const { from, to, count, face } = step.deal;
      const deck = deckId(from);
      if (typeof to === 'string') {
        const spots = resolveSpots(state, catalog, to);
        if (spots.length > 1) {
          if (count > spots.length) {
            throw new SetupError(`"${to}" has ${spots.length} spots; cannot deal ${count} cards.`);
          }
          const places = spots.slice(0, count).map((s) => s.ref);
          run({ type: 'deal', from: deck, to: places, face });
          return;
        }
      }
      run({ type: 'draw', from: deck, count, to, face });
      return;
    }

    const ids = placeIds(step.place);
    // Setups arrange boards too, so locks only apply again once they are placed.
    const locked = ids.filter((id) => state.objects[id]!.locked);
    for (const id of locked) edit(id, { locked: undefined });

    // Lay the pieces out in a row centred on the first, then move the row into place.
    const sized = ids.map((id) => ({ id, size: objectSize(state, catalog, state.objects[id]!) }));
    const first = sized[0]!.size;
    for (const [id, pos] of rows(sized, [-first[0] / 2, -first[1] / 2], Infinity)) {
      edit(id, { pos, snap: undefined });
    }
    run({ type: 'move', ids, to: step.at });

    if (step.rot !== undefined) {
      for (const id of ids) {
        const delta = step.rot - state.objects[id]!.rot;
        if (delta !== 0) run({ type: 'rotate', ids: [id], degrees: delta });
      }
    }
    if (step.face) {
      for (const id of ids) setFace(state.objects[id]!, step.face);
    }
    if (step.shuffle) {
      for (const id of ids) run({ type: 'shuffle', id });
    }
    for (const id of locked) edit(id, { locked: true });
    for (const id of ids) used.add(id);
  }

  function deckId(name: string): string {
    const id = `deck:${name}`;
    if (state.objects[id]?.kind !== 'stack') {
      throw new SetupError(`Deck "${name}" is not on the table any more.`);
    }
    return id;
  }

  /** The table objects a `place` reference names, taking single cards out of their decks. */
  function placeIds(ref: string | { deck: string }): string[] {
    if (typeof ref !== 'string') return [deckId(ref.deck)];
    const object = state.objects[ref];
    if (object) {
      if (object.kind === 'piece' && object.parent) {
        run({ type: 'take', id: ref, to: state.objects[object.parent]!.pos });
      }
      return [ref];
    }
    const ofType = Object.values(state.objects)
      .filter((o) => o.kind === 'piece' && o.type === ref && !o.parent)
      .sort((a, b) => a.z - b.z)
      .map((o) => o.id);
    if (ofType.length === 0) throw new SetupError(`No "${ref}" left to place.`);
    return ofType;
  }

  function setFace(object: TableObject, face: 'up' | 'down'): void {
    const pieces = object.kind === 'stack' ? object.items : [object.id];
    for (const id of pieces) {
      const piece = state.objects[id] as Piece;
      if (piece.face === face) continue;
      const base = catalog[piece.type]?.base;
      if (!base || PRIMITIVE_INFO[base].sides !== 2) {
        throw new SetupError(`"${piece.id}" is a ${base ?? 'piece'} and has only one side.`);
      }
      edit(id, { face });
    }
  }

  return tidyLeftovers(state, project, used);
}

/** Moves everything the setup did not use into rows below the setup's layout. */
function tidyLeftovers(
  state: TableState,
  project: ResolvedProject,
  used: ReadonlySet<string>,
): TableState {
  const top = Object.values(state.objects).filter((o) => !(o.kind === 'piece' && o.parent));
  const placed = top.filter((o) => used.has(o.id));
  const leftover = top.filter((o) => !used.has(o.id)).sort((a, b) => a.z - b.z);
  if (placed.length === 0 || leftover.length === 0) return state;
  let [x0, x1, y1] = [Infinity, -Infinity, -Infinity];
  for (const o of placed) {
    const [w, h] = objectSize(state, project.types, o);
    x0 = Math.min(x0, o.pos[0] - w / 2);
    x1 = Math.max(x1, o.pos[0] + w / 2);
    y1 = Math.max(y1, o.pos[1] + h / 2);
  }
  const sized = leftover.map((o) => ({ id: o.id, size: objectSize(state, project.types, o) }));
  const objects = { ...state.objects };
  for (const [id, pos] of rows(sized, [x0, y1 + MARGIN], Math.max(BOX_WIDTH, x1 - x0))) {
    const next = { ...objects[id]!, pos };
    delete next.snap;
    objects[id] = next;
  }
  return { ...state, objects };
}
