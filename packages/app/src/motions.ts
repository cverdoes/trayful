import type { Motion } from '@trayful/core';
import { useEffect, useState } from 'react';

/** How long each kind of motion lasts, in milliseconds. */
export const MOTION_MS: Record<Motion['kind'], number> = { roll: 1200, shuffle: 800 };

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
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (at === undefined) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      if (time - at < MOTION_MS[kind]) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [kind, at]);
  if (at === undefined) return undefined;
  const elapsed = Math.max(0, now - at);
  return elapsed < MOTION_MS[kind] ? elapsed : undefined;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
