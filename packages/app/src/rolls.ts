import { valueAt, valueCount, valuesOf, type ComponentType } from '@trayful/formats/browser';
import { useEffect, useState } from 'react';

/** How long a die tumbles before it lies still, in milliseconds. */
export const ROLL_MS = 1200;
/** Whole turns a die makes while it tumbles; whole, so it ends the way it lay. */
const TURNS = 2;
/** Faces a die flicks through; the last one is the result. */
const FACE_STEPS = 14;
/** How much bigger a die gets at the top of its tumble, as if lifted off the table. */
const LIFT = 0.15;

/** How a rolling die looks at one moment. */
export interface RollFrame {
  /** Degrees turned on top of the die's own rotation. */
  turn: number;
  scale: number;
  /** Which of the die's values to show for now; undefined once it shows its result. */
  face?: number;
}

/**
 * The die `elapsed` ms into a roll with `faces` values, or undefined once it has settled.
 * It turns quickly and slows down, flicking through faces less and less often, and lands
 * on its result a while before it stops turning.
 */
export function rollFrame(elapsed: number, faces: number): RollFrame | undefined {
  const progress = Math.max(0, elapsed) / ROLL_MS;
  if (progress >= 1) return undefined;
  const eased = 1 - (1 - progress) ** 3;
  const step = Math.floor(eased * FACE_STEPS);
  return {
    turn: eased * TURNS * 360,
    scale: 1 + LIFT * Math.sin(Math.PI * progress),
    ...(step < FACE_STEPS - 1 && faces > 1 ? { face: faceAt(step, faces) } : {}),
  };
}

/** A face for one step that looks random but never shows the same face twice in a row. */
function faceAt(step: number, faces: number): number {
  const scatter = (n: number) => (Math.imul(n + 1, 0x9e3779b1) >>> 0) % faces;
  const face = scatter(step);
  return step > 0 && face === scatter(step - 1) ? (face + 1) % faces : face;
}

/** What a piece shows while it rolls: its turn and size, and the value on top for now. */
export interface ShownRoll {
  turn: number;
  scale: number;
  value?: number | string;
}

/**
 * Animates a die rolled at `rolledAt` (on the `performance.now()` clock), redrawing
 * it every frame until it has settled.
 */
export function useRoll(rolledAt: number | undefined, type: ComponentType): ShownRoll | undefined {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (rolledAt === undefined) return;
    let frame = requestAnimationFrame(function tick(time) {
      setNow(time);
      if (time - rolledAt < ROLL_MS) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [rolledAt]);

  const spec = valuesOf(type);
  if (rolledAt === undefined || !spec) return undefined;
  const frame = rollFrame(now - rolledAt, valueCount(spec));
  if (!frame) return undefined;
  return {
    turn: frame.turn,
    scale: frame.scale,
    ...(frame.face === undefined ? {} : { value: valueAt(spec, frame.face) }),
  };
}

/** Rolls that started `ids` at `now`, keeping only those of `rolls` still under way. */
export function startRolls(
  rolls: Readonly<Record<string, number>>,
  ids: readonly string[],
  now: number,
): Record<string, number> {
  const next = Object.fromEntries(Object.entries(rolls).filter(([, at]) => now - at < ROLL_MS));
  if (prefersReducedMotion()) return next;
  for (const id of ids) next[id] = now;
  return next;
}

/** Milliseconds until every die rolling now has settled, so a snapshot shows the results. */
export function rollsSettleIn(rolls: Readonly<Record<string, number>>, now: number): number {
  return Math.max(0, ...Object.values(rolls).map((at) => at + ROLL_MS - now));
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
