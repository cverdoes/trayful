import { MOTION_MS, type Motion } from '@trayful/core';
import { useEffect, useState } from 'react';

/** A piece or stack in motion now, and when it started on the `performance.now()` clock. */
export interface Moving {
  kind: Motion['kind'];
  at: number;
}

/** Sets `motion`'s pieces moving at `now`, keeping only those of `moving` still under way. */
export function startMotion(
  moving: Readonly<Record<string, Moving>>,
  motion: Motion,
  now: number,
): Record<string, Moving> {
  const next = Object.fromEntries(Object.entries(moving).filter(([, m]) => now < endOf(m)));
  if (prefersReducedMotion()) return next;
  for (const id of motion.ids) next[id] = { kind: motion.kind, at: now };
  return next;
}

/** Milliseconds until everything moving now has come to rest, so a snapshot shows the outcome. */
export function settleIn(moving: Readonly<Record<string, Moving>>, now: number): number {
  return Math.max(0, ...Object.values(moving).map((m) => endOf(m) - now));
}

function endOf(moving: Moving): number {
  return moving.at + MOTION_MS[moving.kind];
}

/**
 * Milliseconds into a motion of `kind` that started at `at`, redrawing every frame
 * until it is over; undefined when nothing is moving.
 */
export function useMotionClock(kind: Motion['kind'], at: number | undefined): number | undefined {
  return useClock(MOTION_MS[kind], at);
}

/**
 * Milliseconds into something lasting `ms` that started at `at` on the `performance.now()`
 * clock, redrawing every frame until it is over; undefined when it is not under way.
 */
export function useClock(ms: number, at: number | undefined): number | undefined {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (at === undefined) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      if (time - at < ms) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [ms, at]);
  if (at === undefined) return undefined;
  const elapsed = Math.max(0, now - at);
  return elapsed < ms ? elapsed : undefined;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
