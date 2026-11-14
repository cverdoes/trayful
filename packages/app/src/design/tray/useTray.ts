// Loading and saving one component's Tray: edits show at once and are saved a
// moment after the last one, the way the designer saves a component.
import { useEffect, useMemo, useState } from 'react';
import { fetchTray, importCsv, moveToCsv, saveTray } from '../api';
import { noSteps, redone, stepped, undone, type Steps } from '../panel/steps';
import { projectId, UNDO_MERGE } from '../store';
import { withUsedTables, type TrayData } from './tray';

/** How long after the last edit the Tray is saved, in milliseconds. */
const SAVE_DELAY = 400;

export type TrayStatus = 'loading' | 'saved' | 'unsaved' | 'saving' | 'failed';

/** Reports how saving is going, with what went wrong when it failed. */
type Report = (status: TrayStatus, message?: string) => void;

/**
 * Saves edits a moment after the last one, so typing a word saves once. A save
 * that ends after a newer edit leaves the status to that edit.
 */
export class TraySaver {
  private edits = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: TrayData | undefined;

  constructor(
    private readonly save: (tray: TrayData) => Promise<unknown>,
    private readonly report: Report,
    private readonly delay = SAVE_DELAY,
  ) {}

  edit(next: TrayData): void {
    const edit = ++this.edits;
    this.pending = next;
    this.report('unsaved');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.report('saving');
      this.flush().then(
        () => edit === this.edits && this.report('saved'),
        (err: unknown) => this.report('failed', errorText(err)),
      );
    }, this.delay);
  }

  /** Saves the edit waiting to be saved, now. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    const next = this.pending;
    this.pending = undefined;
    if (next) await this.save(next);
  }

  /** Runs a change of its own after saving what is waiting; edits before it stop reporting. */
  async then<T>(change: () => Promise<T>): Promise<T> {
    this.edits++;
    this.report('saving');
    await this.flush();
    return change();
  }
}

/**
 * Tells which edits join the one before them as a single step to undo: typing
 * in the same field, less than UNDO_MERGE after the last keystroke. An edit in
 * another field, or one not typed (a button, a picker), is a step of its own.
 */
export class EditJoiner {
  private field: unknown;
  private at = 0;

  /** Whether an edit typed into `field` (undefined when not typed) at `now` joins the last one. */
  joins(field: unknown, now: number): boolean {
    const joins = field !== undefined && field === this.field && now - this.at < UNDO_MERGE;
    this.field = field;
    this.at = now;
    return joins;
  }

  /** Makes the next edit a step of its own, as after an undo or a CSV file added. */
  reset(): void {
    this.field = undefined;
  }
}

/** The text field being typed in, if any: edits there may join into one step. */
function typingField(): Element | undefined {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  const typed =
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && active.type !== 'checkbox' && active.type !== 'radio');
  return typed ? active : undefined;
}

export interface TrayState {
  tray?: TrayData;
  status: TrayStatus;
  message?: string;
  /**
   * Shows an edit at once and saves it soon. Typing joins the step before it to
   * undo, unless the edit is `alone`, as pasting several cells is.
   */
  edit: (tray: TrayData, alone?: boolean) => void;
  /** Adds a CSV file, as a new entry reading it. */
  addCsv: (csv: { name: string; text: string }) => void;
  /** Moves the designs typed into an entry, by its place, to a CSV file of their own. */
  toCsv: (entry: number) => void;
  steps: Steps<TrayData>;
  undo: () => void;
  redo: () => void;
}

export function useTray(type: string): TrayState {
  const [tray, setTray] = useState<TrayData>();
  const [status, setStatus] = useState<TrayStatus>('loading');
  const [message, setMessage] = useState<string>();
  const report: Report = (next, text) => {
    setStatus(next);
    setMessage(text);
  };
  const saver = useMemo(
    () => new TraySaver((next) => saveTray(projectId(), type, withUsedTables(next)), report),
    [type],
  );
  const [steps, setSteps] = useState(noSteps<TrayData>);
  // Typing a word in one field is one step to undo; see EditJoiner.
  const [joiner] = useState(() => new EditJoiner());

  useEffect(() => {
    let current = true;
    fetchTray(projectId(), type).then(
      (loaded) => {
        if (!current) return;
        setTray(loaded);
        setStatus('saved');
      },
      (err: unknown) => current && report('failed', errorText(err)),
    );
    return () => {
      current = false;
      // Switching to another component saves the edit waiting to be saved first.
      saver.flush().catch(() => undefined);
    };
  }, [type, saver]);

  const show = (next: TrayData) => {
    setTray(next);
    saver.edit(next);
  };

  const edit = (next: TrayData, alone = false) => {
    if (!tray) return;
    const field = alone ? undefined : typingField();
    setSteps(stepped(steps, tray, joiner.joins(field, Date.now())));
    show(next);
  };

  const move = (to: typeof undone<TrayData>) => () => {
    const moved = tray && to(steps, tray);
    if (!moved) return;
    setSteps(moved.steps);
    joiner.reset();
    show(moved.value);
  };

  /** A change the server makes to the files itself, after saving what is waiting; one step to undo. */
  const change = (request: () => Promise<TrayData>) => {
    const before = tray;
    saver.then(request).then(
      (saved) => {
        if (before) setSteps((s) => stepped(s, before, false));
        joiner.reset();
        setTray(saved);
        report('saved');
      },
      (err: unknown) => report('failed', errorText(err)),
    );
  };

  const addCsv = (csv: { name: string; text: string }) =>
    change(() => importCsv(projectId(), type, csv));
  const toCsv = (entry: number) => change(() => moveToCsv(projectId(), type, entry));

  return {
    tray,
    status,
    message,
    edit,
    addCsv,
    toCsv,
    steps,
    undo: move(undone),
    redo: move(redone),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
