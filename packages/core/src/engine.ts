import { applyCommand, type Command } from './commands.js';
import type { Catalog, TableState } from './state.js';

/** A history step: a command, or a whole-table replacement such as a reset. */
export type HistoryStep = Command | { type: 'replace' };

export interface HistoryEntry {
  command: HistoryStep;
  /** State before the command, used for undo. */
  before: TableState;
}

export type Listener = (
  state: TableState,
  change: { kind: 'apply' | 'undo' | 'redo'; command: HistoryStep },
) => void;

/**
 * Holds one table's state and its undo history. All changes go through
 * `dispatch`, so people and agents share one history.
 */
export class TableEngine {
  private current: TableState;
  private past: HistoryEntry[] = [];
  /** Undone commands; here `before` holds the state to restore on redo. */
  private future: HistoryEntry[] = [];
  private listeners = new Set<Listener>();

  constructor(
    initial: TableState,
    private readonly catalog: Catalog,
    private readonly historyLimit = 500,
  ) {
    this.current = initial;
  }

  get state(): TableState {
    return this.current;
  }

  /** Applies a command. Throws `CommandError` and leaves the state unchanged when it is invalid. */
  dispatch(command: Command): TableState {
    const before = this.current;
    this.current = applyCommand(before, command, this.catalog);
    this.past.push({ command, before });
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.emit('apply', command);
    return this.current;
  }

  /** Replaces the whole table (for example a reset to a fresh table) as one undoable step. */
  replace(state: TableState): TableState {
    const command: HistoryStep = { type: 'replace' };
    this.past.push({ command, before: this.current });
    if (this.past.length > this.historyLimit) this.past.shift();
    this.future = [];
    this.current = state;
    this.emit('apply', command);
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push({ command: entry.command, before: this.current });
    this.current = entry.before;
    this.emit('undo', entry.command);
    return true;
  }

  redo(): boolean {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push({ command: entry.command, before: this.current });
    this.current = entry.before;
    this.emit('redo', entry.command);
    return true;
  }

  /** Commands applied so far, oldest first (undone commands excluded). */
  get history(): readonly HistoryStep[] {
    return this.past.map((e) => e.command);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(kind: 'apply' | 'undo' | 'redo', command: HistoryStep): void {
    for (const listener of this.listeners) listener(this.current, { kind, command });
  }
}
