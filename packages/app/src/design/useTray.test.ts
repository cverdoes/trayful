import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrayData } from './tray';
import { TraySaver, type TrayStatus } from './useTray';

const tray = (count: number): TrayData => ({ entries: [{ count }], tables: {} });

function setup(save: (tray: TrayData) => Promise<unknown> = () => Promise.resolve()) {
  const reports: [TrayStatus, string?][] = [];
  const saved: TrayData[] = [];
  const saver = new TraySaver(
    (next) => {
      saved.push(next);
      return save(next);
    },
    (status, message) => reports.push(message === undefined ? [status] : [status, message]),
    100,
  );
  return { saver, reports, saved };
}

describe('TraySaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once, a moment after the last edit', async () => {
    const { saver, reports, saved } = setup();
    saver.edit(tray(1));
    saver.edit(tray(2));
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(saved).toEqual([tray(2)]);
    expect(reports.map(([status]) => status)).toEqual(['unsaved', 'unsaved', 'saving', 'saved']);
  });

  it('leaves the status to a newer edit when a save ends after it', async () => {
    const finishers: (() => void)[] = [];
    const { saver, reports } = setup(
      () =>
        new Promise<void>((resolve) => {
          finishers.push(resolve);
        }),
    );
    saver.edit(tray(1));
    await vi.advanceTimersByTimeAsync(100);
    saver.edit(tray(2));
    finishers.forEach((finish) => finish());
    await vi.advanceTimersByTimeAsync(0);
    expect(reports.at(-1)).toEqual(['unsaved']);
  });

  it('reports what went wrong when a save fails', async () => {
    const { saver, reports } = setup(() => Promise.reject(new Error('disk full')));
    saver.edit(tray(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(reports.at(-1)).toEqual(['failed', 'disk full']);
  });

  it('saves the waiting edit at once when flushed, and only once', async () => {
    const { saver, saved } = setup();
    saver.edit(tray(3));
    await saver.flush();
    await vi.advanceTimersByTimeAsync(200);
    await saver.flush();
    expect(saved).toEqual([tray(3)]);
  });

  it('saves what is waiting before running a change of its own', async () => {
    const order: string[] = [];
    const { saver, reports } = setup(() => {
      order.push('save');
      return Promise.resolve();
    });
    saver.edit(tray(4));
    const result = await saver.then(() => {
      order.push('change');
      return Promise.resolve('done');
    });
    expect(result).toBe('done');
    expect(order).toEqual(['save', 'change']);
    expect(reports.at(-1)).toEqual(['saving']);
  });
});
