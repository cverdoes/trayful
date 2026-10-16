// Loading and saving one component's Tray: edits show at once and are saved a
// moment after the last one, the way the designer saves a component.
import { useEffect, useMemo, useState } from 'react';
import { fetchTray, importCsv, saveTray } from './api';
import { projectId } from './store';
import type { TrayData } from './tray';

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

export interface TrayState {
  tray?: TrayData;
  status: TrayStatus;
  message?: string;
  /** Shows an edit at once and saves it soon. */
  edit: (tray: TrayData) => void;
  /** Adds a CSV file, as a new entry reading it. */
  addCsv: (csv: { name: string; text: string }) => void;
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
    () => new TraySaver((next) => saveTray(projectId(), type, next), report),
    [type],
  );

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

  const edit = (next: TrayData) => {
    setTray(next);
    saver.edit(next);
  };

  const addCsv = (csv: { name: string; text: string }) => {
    saver
      .then(() => importCsv(projectId(), type, csv))
      .then(
        (saved) => {
          setTray(saved);
          report('saved');
        },
        (err: unknown) => report('failed', errorText(err)),
      );
  };

  return { tray, status, message, edit, addCsv };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
