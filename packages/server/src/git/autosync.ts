// Syncing a git-backed workspace by itself: a commit once changes settle, a fetch now and then, a push less often.

/** How often Trayful commits, fetches and pushes on its own, in milliseconds. */
export interface SyncTimes {
  /** Commit this long after the last change to the project files. */
  saveAfterMs: number;
  /** Fetch the branch, and take in its new commits, this often. */
  fetchEveryMs: number;
  /** Push at most this often, on one of the fetches. */
  pushEveryMs: number;
}

export const DEFAULT_SYNC_TIMES: SyncTimes = {
  saveAfterMs: 30_000,
  fetchEveryMs: 120_000,
  pushEveryMs: 300_000,
};

/** What the timers ask for. Failures are the caller's to keep; the timers carry on. */
export interface SyncSteps {
  /** Commit what changed. */
  save: () => Promise<unknown>;
  /** Commit, take in the branch's new commits, and push if `push`. */
  sync: (push: boolean) => Promise<unknown>;
}

/**
 * The timers of a git-backed workspace. `changed` restarts the wait for the files
 * to settle; a fetch runs every `fetchEveryMs`, and pushes when the last push is
 * `pushEveryMs` or more ago.
 */
export class AutoSync {
  private saveTimer: NodeJS.Timeout | undefined;
  private fetchTimer: NodeJS.Timeout | undefined;
  private lastPush: number;

  constructor(
    private readonly steps: SyncSteps,
    private readonly times: SyncTimes = DEFAULT_SYNC_TIMES,
    private readonly now: () => number = Date.now,
  ) {
    this.lastPush = now();
  }

  start(): void {
    // Timers never keep the process running on their own; stopping the server ends them.
    this.fetchTimer ??= setInterval(() => void this.fetch(), this.times.fetchEveryMs).unref();
  }

  /** The project files changed: commit once they have been still for a while. */
  changed(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(
      () => void this.steps.save().catch(ignore),
      this.times.saveAfterMs,
    ).unref();
  }

  /** A sync someone asked for pushed, so the next timed push can wait. */
  pushed(): void {
    this.lastPush = this.now();
  }

  stop(): void {
    clearTimeout(this.saveTimer);
    clearInterval(this.fetchTimer);
    this.saveTimer = undefined;
    this.fetchTimer = undefined;
  }

  private async fetch(): Promise<void> {
    const push = this.now() - this.lastPush >= this.times.pushEveryMs;
    try {
      await this.steps.sync(push);
      if (push) this.lastPush = this.now();
    } catch {
      // Kept as the repository's last error, which the status shows; try again next time.
    }
  }
}

/** The repository keeps a failed sync's error for its status; the timer has nothing to add. */
function ignore(): void {
  // Nothing to do.
}
