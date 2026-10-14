import { handCounts, type Piece, type Stack, type TableObject, type TableState } from './state.js';

/**
 * What one player may know about a table. Pieces in other players' hands are left
 * out (only how many each holds is shown), and face-down pieces lose their data
 * and get a stand-in id, so neither their text nor their id gives them away.
 * The random generator's state is left out too, since it predicts shuffles.
 */
export interface TableView extends TableState {
  /** How many pieces each player holds, by player id. */
  hands: Record<string, number>;
}

/** Hands out stand-in ids for hidden pieces, and finds the real piece behind one. */
export interface Aliases {
  alias(id: string): string;
  resolve(alias: string): string | undefined;
}

/** Stand-in ids start with this, so they cannot clash with component ids. */
export const HIDDEN_PREFIX = 'hidden-';

/** Whether a piece's identity is hidden from `viewer`. */
export function isHidden(piece: Piece, viewer: string | undefined): boolean {
  if (piece.hand) return piece.hand !== viewer;
  return piece.face === 'down';
}

export function viewFor(
  state: TableState,
  viewer: string | undefined,
  aliases: Aliases,
): TableView {
  const objects: Record<string, TableObject> = {};
  const name = (id: string): string => {
    const object = state.objects[id];
    return object?.kind === 'piece' && isHidden(object, viewer) ? aliases.alias(id) : id;
  };
  const snapRef = (snap: string | undefined) => {
    if (!snap) return snap;
    const [owner, ...rest] = snap.split('/');
    return [name(owner!), ...rest].join('/');
  };
  for (const object of Object.values(state.objects)) {
    if (object.kind === 'stack') {
      const stack: Stack = { ...object, items: object.items.map(name) };
      if (object.snap) stack.snap = snapRef(object.snap);
      objects[stack.id] = stack;
      continue;
    }
    if (object.hand && object.hand !== viewer) continue;
    if (isHidden(object, viewer)) {
      const id = aliases.alias(object.id);
      const hidden: Piece = { ...object, id };
      delete hidden.data;
      if (object.snap) hidden.snap = snapRef(object.snap);
      objects[id] = hidden;
      continue;
    }
    objects[object.id] = object.snap ? { ...object, snap: snapRef(object.snap) } : object;
  }
  return { ...state, seed: 0, rng: 0, objects, hands: handCounts(state) };
}

/** Swaps stand-in ids in a message from a player back to the real ids, at any depth. */
export function resolveAliases<T>(value: T, aliases: Aliases): T {
  if (typeof value === 'string') {
    if (!value.includes(HIDDEN_PREFIX)) return value;
    const [first, ...rest] = value.split('/');
    const real = aliases.resolve(first!);
    return (real ? [real, ...rest].join('/') : value) as T;
  }
  if (Array.isArray(value)) return value.map((v) => resolveAliases(v, aliases)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveAliases(v, aliases)]),
    ) as T;
  }
  return value;
}

/**
 * Stand-in ids for one table. A piece keeps its stand-in while it stays hidden, as
 * a face-down card you can follow with your eyes; `forget` drops stand-ins after a
 * shuffle, and `prune` drops those of pieces that came into view.
 */
export class AliasBook implements Aliases {
  private byId = new Map<string, string>();
  private byAlias = new Map<string, string>();

  constructor(private readonly random: () => string) {}

  alias(id: string): string {
    let alias = this.byId.get(id);
    if (!alias) {
      do alias = HIDDEN_PREFIX + this.random();
      while (this.byAlias.has(alias));
      this.byId.set(id, alias);
      this.byAlias.set(alias, id);
    }
    return alias;
  }

  resolve(alias: string): string | undefined {
    return this.byAlias.get(alias);
  }

  forget(ids: Iterable<string>): void {
    for (const id of ids) {
      const alias = this.byId.get(id);
      if (alias) this.byAlias.delete(alias);
      this.byId.delete(id);
    }
  }

  /** Drops every stand-in, so no hidden piece can be followed across the change. */
  clear(): void {
    this.byId.clear();
    this.byAlias.clear();
  }

  /**
   * Drops stand-ins no one needs any more: of pieces that came into view, and of
   * pieces taken into a hand, which other players do not see at all. A card played
   * face down from a hand so gets a fresh stand-in, as if the hand had been mixed.
   */
  prune(state: TableState): void {
    const stale: string[] = [];
    for (const id of this.byId.keys()) {
      const piece = state.objects[id];
      if (piece?.kind !== 'piece' || piece.hand || piece.face === 'up') stale.push(id);
    }
    this.forget(stale);
  }
}

/**
 * The whole table with other players' hands taken out (only their counts kept), for
 * a viewer allowed to peek at face-down cards, such as an agent asked to reveal.
 */
export function withoutOtherHands(state: TableState, viewer: string | undefined): TableView {
  const objects = Object.fromEntries(
    Object.entries(state.objects).filter(
      ([, o]) => !(o.kind === 'piece' && o.hand && o.hand !== viewer),
    ),
  );
  return { ...state, objects, hands: handCounts(state) };
}
