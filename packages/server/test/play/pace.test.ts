import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLIDE_MS, MOTION_MS } from '@trayful/core';
import { AgentPace } from '../../src/play/pace.js';

describe('AgentPace', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settled = (pace: AgentPace) => {
    let done = false;
    void pace.playedOut().then(() => (done = true));
    return () => done;
  };

  it('holds the agent until a move has glided into place for people watching', async () => {
    const pace = new AgentPace(true);
    pace.changed(undefined, 1);
    const done = settled(pace);
    await vi.advanceTimersByTimeAsync(GLIDE_MS - 1);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  });

  it('waits for dice to land', async () => {
    const pace = new AgentPace(true);
    pace.changed({ kind: 'roll', ids: ['d'] }, 2);
    const done = settled(pace);
    await vi.advanceTimersByTimeAsync(MOTION_MS.roll - 1);
    expect(done()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done()).toBe(true);
  });

  it('does not wait when nobody watches or pacing is off', async () => {
    for (const [enabled, watchers] of [
      [true, 0],
      [false, 3],
    ] as const) {
      const pace = new AgentPace(enabled);
      pace.changed(undefined, watchers);
      const done = settled(pace);
      await vi.advanceTimersByTimeAsync(0);
      expect(done()).toBe(true);
    }
  });
});
