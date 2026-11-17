import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoSync } from '../../src/git/autosync.js';

const TIMES = { saveAfterMs: 1000, fetchEveryMs: 5000, pushEveryMs: 12_000 };

describe('AutoSync', () => {
  let saves: number;
  let syncs: boolean[];
  let auto: AutoSync;

  beforeEach(() => {
    vi.useFakeTimers();
    saves = 0;
    syncs = [];
    auto = new AutoSync(
      {
        save: () => {
          saves++;
          return Promise.resolve();
        },
        sync: (push) => {
          syncs.push(push);
          return Promise.resolve();
        },
      },
      TIMES,
    );
  });

  afterEach(() => {
    auto.stop();
    vi.useRealTimers();
  });

  it('commits once the files have been still for a while', async () => {
    auto.changed();
    await vi.advanceTimersByTimeAsync(800);
    auto.changed();
    await vi.advanceTimersByTimeAsync(800);
    expect(saves).toBe(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(saves).toBe(1);
  });

  it('fetches on every beat and pushes on the beats a push is due', async () => {
    auto.start();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(syncs).toEqual([false, false, true]);
  });

  it('waits a whole push interval after a push someone asked for', async () => {
    auto.start();
    await vi.advanceTimersByTimeAsync(9000);
    auto.pushed();
    await vi.advanceTimersByTimeAsync(11_000);
    expect(syncs).toEqual([false, false, false, false]);
  });

  it('keeps going after a failed sync, and stops when told', async () => {
    const failing = new AutoSync(
      { save: () => Promise.reject(new Error('no')), sync: () => Promise.reject(new Error('no')) },
      TIMES,
    );
    failing.start();
    failing.changed();
    await vi.advanceTimersByTimeAsync(10_000);
    failing.stop();
    auto.start();
    auto.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(syncs).toEqual([]);
  });
});
