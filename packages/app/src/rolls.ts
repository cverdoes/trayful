import { valueAt, valueCount, valuesOf, type ComponentType } from '@trayful/formats/browser';
import { MOTION_MS, useMotionClock } from './motions';

const ROLL_MS = MOTION_MS.roll;
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

/** Animates a die rolled at `rolledAt` until it has settled. */
export function useRoll(rolledAt: number | undefined, type: ComponentType): ShownRoll | undefined {
  const elapsed = useMotionClock('roll', rolledAt);
  const spec = valuesOf(type);
  if (elapsed === undefined || !spec) return undefined;
  const frame = rollFrame(elapsed, valueCount(spec));
  if (!frame) return undefined;
  return {
    turn: frame.turn,
    scale: frame.scale,
    ...(frame.face === undefined ? {} : { value: valueAt(spec, frame.face) }),
  };
}
