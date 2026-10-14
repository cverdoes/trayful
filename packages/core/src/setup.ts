import { FORMAT_VERSION, PRIMITIVE_INFO, type SetupStep } from '@trayful/formats/browser';
import type { ResolvedProject } from '@trayful/formats';
import { BOX_WIDTH, deckStackId, MARGIN, newDeck, newPiece, rows, type Sized } from './box.js';
import { applyCommand, CommandError, type Command } from './commands.js';
import { boundsOf, objectSize } from './layout.js';
import { seedState } from './rng.js';
import { resolveSpots, SnapError } from './snap.js';
import {
  onTable,
  sizeOf,
  withChanges,
  type Catalog,
  type Piece,
  type TableObject,
  type TableState,
} from './state.js';

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
  const sized: Sized[] = [];
  let z = 0;
  const decks = new Set<string>();
  for (const spec of project.components) {
    const type = project.types[spec.type]!;
    if (spec.deck) {
      if (decks.has(spec.deck)) continue;
      decks.add(spec.deck);
      // Decks list their top card first; stacks store bottom to top.
      const ids = [...project.decks[spec.deck]!].reverse();
      const stack = newDeck(spec.deck, ids, z++);
      for (const id of ids) {
        const member = project.components.find((c) => c.id === id)!;
        objects[id] = newPiece(member, project.types[member.type]!, 'down', stack.id);
      }
      objects[stack.id] = stack;
      sized.push({ id: stack.id, size: sizeOf(type) });
      continue;
    }
    objects[spec.id] = { ...newPiece(spec, type, 'up'), z: z++ };
    sized.push({ id: spec.id, size: sizeOf(type) });
  }
  for (const [id, pos] of rows(sized, [0, 0], BOX_WIDTH)) {
    objects[id] = { ...objects[id]!, pos };
  }
  return { format: FORMAT_VERSION, table: name, seed, rng: seedState(seed), objects };
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
  const runner = new SetupRunner(initial, project.types);
  setup.steps.forEach((step, i) => {
    try {
      runner.run(step);
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
  return tidyLeftovers(runner.state, project, runner.used);
}

/** Runs setup steps one after another, keeping track of the objects they put in place. */
class SetupRunner {
  /** Objects a step placed, or brought onto the table, such as dealt cards. */
  readonly used = new Set<string>();

  constructor(
    public state: TableState,
    private readonly catalog: Catalog,
  ) {}

  run(step: SetupStep): void {
    const before = this.topLevel();
    if ('place' in step) this.place(step);
    else if ('deal' in step) this.deal(step.deal);
    else this.command({ type: 'shuffle', id: this.deckId(step.shuffle) });
    for (const id of this.topLevel()) if (!before.has(id)) this.used.add(id);
  }

  private deal({ from, to, count, face }: Extract<SetupStep, { deal: unknown }>['deal']): void {
    const deck = this.deckId(from);
    const spots = typeof to === 'string' ? resolveSpots(this.state, this.catalog, to) : [];
    if (spots.length <= 1) {
      this.command({ type: 'draw', from: deck, count, to, face });
      return;
    }
    // Dealing to a whole snap target puts one card on each of its first spots.
    if (count > spots.length) {
      throw new SetupError(
        `"${to as string}" has ${spots.length} spots; cannot deal ${count} cards.`,
      );
    }
    const places = spots.slice(0, count).map((s) => s.ref);
    this.command({ type: 'deal', from: deck, to: places, face });
  }

  private place(step: Extract<SetupStep, { place: unknown }>): void {
    const ids = this.placeIds(step.place);
    // Setups arrange boards too, so locks only apply again once they are placed.
    const locked = ids.filter((id) => this.state.objects[id]!.locked);
    for (const id of locked) this.edit(id, { locked: undefined });

    // Lay the pieces out in a row centred on the first, then move the row into place.
    const sized = ids.map((id) => ({
      id,
      size: objectSize(this.state, this.catalog, this.state.objects[id]!),
    }));
    const first = sized[0]!.size;
    for (const [id, pos] of rows(sized, [-first[0] / 2, -first[1] / 2], Infinity)) {
      this.edit(id, { pos, snap: undefined });
    }
    this.command({ type: 'move', ids, to: step.at });

    for (const id of ids) {
      const delta = step.rot === undefined ? 0 : step.rot - this.state.objects[id]!.rot;
      if (delta !== 0) this.command({ type: 'rotate', ids: [id], degrees: delta });
      if (step.face) this.setFace(this.state.objects[id]!, step.face);
      if (step.shuffle) this.command({ type: 'shuffle', id });
    }
    for (const id of locked) this.edit(id, { locked: true });
    for (const id of ids) this.used.add(id);
  }

  private command(command: Command): void {
    this.state = applyCommand(this.state, command, this.catalog);
  }

  /** Changes an object directly, for what setups may do that commands may not. */
  private edit(id: string, changes: Partial<TableObject>): void {
    const next = withChanges(this.state.objects[id]!, changes);
    this.state = { ...this.state, objects: { ...this.state.objects, [id]: next } };
  }

  private topLevel(): Set<string> {
    return new Set(
      Object.values(this.state.objects)
        .filter(onTable)
        .map((o) => o.id),
    );
  }

  private deckId(name: string): string {
    const id = deckStackId(name);
    if (this.state.objects[id]?.kind !== 'stack') {
      throw new SetupError(`Deck "${name}" is not on the table any more.`);
    }
    return id;
  }

  /** The table objects a `place` reference names, taking single cards out of their decks. */
  private placeIds(ref: string | { deck: string }): string[] {
    if (typeof ref !== 'string') return [this.deckId(ref.deck)];
    const object = this.state.objects[ref];
    if (object) {
      if (object.kind === 'piece' && object.parent) {
        this.command({ type: 'take', id: ref, to: this.state.objects[object.parent]!.pos });
      }
      return [ref];
    }
    const ofType = Object.values(this.state.objects)
      .filter((o) => o.kind === 'piece' && o.type === ref && !o.parent)
      .sort((a, b) => a.z - b.z)
      .map((o) => o.id);
    if (ofType.length === 0) throw new SetupError(`No "${ref}" left to place.`);
    return ofType;
  }

  private setFace(object: TableObject, face: 'up' | 'down'): void {
    const pieces = object.kind === 'stack' ? object.items : [object.id];
    for (const id of pieces) {
      const piece = this.state.objects[id] as Piece;
      if (piece.face === face) continue;
      const base = this.catalog[piece.type]?.base;
      if (!base || PRIMITIVE_INFO[base].sides !== 2) {
        throw new SetupError(`"${piece.id}" is a ${base ?? 'piece'} and has only one side.`);
      }
      this.edit(id, { face });
    }
  }
}

/** Moves everything the setup did not use into rows below the setup's layout. */
function tidyLeftovers(
  state: TableState,
  project: ResolvedProject,
  used: ReadonlySet<string>,
): TableState {
  const top = Object.values(state.objects).filter(onTable);
  const placed = top.filter((o) => used.has(o.id));
  const leftover = top.filter((o) => !used.has(o.id)).sort((a, b) => a.z - b.z);
  if (placed.length === 0 || leftover.length === 0) return state;
  const box = boundsOf(state, project.types, placed);
  const sized = leftover.map((o) => ({ id: o.id, size: objectSize(state, project.types, o) }));
  const objects = { ...state.objects };
  for (const [id, pos] of rows(
    sized,
    [box.x0, box.y1 + MARGIN],
    Math.max(BOX_WIDTH, box.x1 - box.x0),
  )) {
    const next = { ...objects[id]!, pos };
    delete next.snap;
    objects[id] = next;
  }
  return { ...state, objects };
}
