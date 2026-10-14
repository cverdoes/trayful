import { applyCommand, CommandError, type Command } from './commands.js';
import { removeObject, type Catalog, type TableObject, type TableState } from './state.js';

/** A history step: a command, or a whole-table replacement such as a reset. */
export type HistoryStep = Command | { type: 'replace' };

export interface HistoryEntry {
  command: HistoryStep;
  /** Who made the change; steps without a player are the table's own, such as reloads. */
  player?: string;
  /** State before and after the change, used for undo and redo. */
  before: TableState;
  after: TableState;
  /** Undone, and waiting on its player's redo stack. */
  undone: boolean;
}

export type Listener = (
  state: TableState,
  change: { kind: 'apply' | 'undo' | 'redo'; command: HistoryStep; player?: string },
) => void;

/**
 * Holds one table's state and its history. All changes go through `dispatch`, so
 * people and agents share one history, but each player undoes and redoes only their
 * own changes. Undoing an older change puts back just the objects it changed, and is
 * refused when someone has changed those objects since.
 */
export class TableEngine {
  private current: TableState;
  private past: HistoryEntry[] = [];
  /** Undone changes per player, most recent last. */
  private future = new Map<string | undefined, HistoryEntry[]>();
  private listeners = new Set<Listener>();

  constructor(
    initial: TableState,
    private catalog: Catalog,
    private readonly historyLimit = 500,
  ) {
    this.current = initial;
  }

  /** Swaps in new component types, for example after the project files were edited. */
  setCatalog(catalog: Catalog): void {
    this.catalog = catalog;
  }

  get state(): TableState {
    return this.current;
  }

  /** Applies a command. Throws `CommandError` and leaves the state unchanged when it is invalid. */
  dispatch(command: Command, player?: string): TableState {
    return this.record(command, applyCommand(this.current, command, this.catalog), player);
  }

  /** Replaces the whole table (for example a reset to a fresh table) as one undoable step. */
  replace(state: TableState, player?: string): TableState {
    return this.record({ type: 'replace' }, state, player);
  }

  private record(command: HistoryStep, after: TableState, player?: string): TableState {
    this.past.push({ command, player, before: this.current, after, undone: false });
    if (this.past.length > this.historyLimit) {
      const dropped = this.past.shift()!;
      const redo = this.future.get(dropped.player);
      if (redo?.[0] === dropped) redo.shift();
    }
    this.future.delete(player);
    this.current = after;
    this.emit('apply', command, player);
    return this.current;
  }

  /** Whether `player` has a change of their own they can undo now. */
  canUndoFor(player?: string): boolean {
    const entry = this.lastDone(player);
    return !!entry && this.unchangedSince(entry, 'after');
  }

  /** Whether `player` has an undone change they can redo now. */
  canRedoFor(player?: string): boolean {
    const entry = this.future.get(player)?.at(-1);
    return !!entry && this.unchangedSince(entry, 'before');
  }

  /** Whether the table's own changes (made without a player) can be undone. */
  get canUndo(): boolean {
    return this.canUndoFor();
  }

  get canRedo(): boolean {
    return this.canRedoFor();
  }

  /**
   * Undoes `player`'s most recent change. Returns false when they have none, and
   * throws `CommandError` when someone has changed the same objects since.
   */
  undo(player?: string): boolean {
    const entry = this.lastDone(player);
    if (!entry) return false;
    this.current = this.revert(entry, 'after', 'before');
    entry.undone = true;
    const redo = this.future.get(player) ?? [];
    redo.push(entry);
    this.future.set(player, redo);
    this.emit('undo', entry.command, player);
    return true;
  }

  /** Redoes `player`'s most recently undone change, if nothing it touched changed since. */
  redo(player?: string): boolean {
    const redo = this.future.get(player);
    const entry = redo?.at(-1);
    if (!entry) return false;
    this.current = this.revert(entry, 'before', 'after');
    redo!.pop();
    entry.undone = false;
    this.emit('redo', entry.command, player);
    return true;
  }

  /** Commands applied so far, oldest first (undone commands excluded). */
  get history(): readonly HistoryStep[] {
    return this.past.filter((e) => !e.undone).map((e) => e.command);
  }

  /** Every step still in effect, with who made it. */
  get entries(): readonly Readonly<HistoryEntry>[] {
    return this.past.filter((e) => !e.undone);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private lastDone(player: string | undefined): HistoryEntry | undefined {
    for (let i = this.past.length - 1; i >= 0; i--) {
      const entry = this.past[i]!;
      if (entry.player === player && !entry.undone) return entry;
    }
    return undefined;
  }

  /**
   * Whether the objects a step changed still look as they did on its `side`, so the
   * step can be undone (side `after`) or redone (side `before`) without overwriting
   * anyone else's change.
   */
  private unchangedSince(entry: HistoryEntry, side: 'before' | 'after'): boolean {
    if (this.current === entry[side]) return true;
    const expected = entry[side].objects;
    return changedIds(entry).every((id) => this.current.objects[id] === expected[id]);
  }

  /** Puts the objects a step changed back from `from` to `to`, leaving everything else. */
  private revert(entry: HistoryEntry, from: 'before' | 'after', to: 'before' | 'after') {
    // Nothing happened since: return to the exact state, random generator included.
    if (this.current === entry[from]) return entry[to];
    if (!this.unchangedSince(entry, from)) {
      throw new CommandError(
        `Someone has changed those pieces since, so this cannot be ${to === 'before' ? 'undone' : 'redone'}.`,
      );
    }
    const objects: Record<string, TableObject> = { ...this.current.objects };
    const target = entry[to].objects;
    for (const id of changedIds(entry)) {
      if (target[id]) objects[id] = target[id];
      else removeObject(objects, id);
    }
    return { ...this.current, objects };
  }

  private emit(kind: 'apply' | 'undo' | 'redo', command: HistoryStep, player?: string): void {
    for (const listener of this.listeners) listener(this.current, { kind, command, player });
  }
}

/** Ids of the objects a step added, removed or changed. */
function changedIds({ before, after }: HistoryEntry): string[] {
  const ids = new Set<string>();
  for (const id of Object.keys(after.objects)) {
    if (before.objects[id] !== after.objects[id]) ids.add(id);
  }
  for (const id of Object.keys(before.objects)) if (!after.objects[id]) ids.add(id);
  return [...ids];
}
