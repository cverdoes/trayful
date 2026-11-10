import type { Ring } from '../render/Component';
import { useStore } from '../store';
import { glideFrame, RING_MS, type GlideFrame, type Place } from './glides';
import { useClock } from './motions';

/** How an object glides now, if it does; it lies at `to` once it has landed. */
export function useGlide(id: string, to: Place): GlideFrame | undefined {
  const glide = useStore((s) => s.glides[id]);
  const elapsed = useClock(RING_MS, glide?.at);
  return glide && elapsed !== undefined ? glideFrame(glide, to, elapsed) : undefined;
}

/**
 * Where a card shows inside a stack lying at `stack`: at `home`, or on its way there from
 * where it was on the table while it glides into the stack.
 */
export function useCardGlide(id: string, home: Point, stack: Place) {
  const glide = useGlide(id, { pos: inStack(home, stack), rot: stack.rot });
  const [x, y] = glide ? fromStack(glide.pos, stack) : home;
  return { x, y, rotation: glide ? glide.rot - stack.rot : 0 };
}

type Point = readonly [number, number];

/** Where an object shows: where it lies, or on its way there while it glides. */
export function placed(object: Place, glide: GlideFrame | undefined) {
  const { pos, rot } = glide ?? object;
  return { x: pos[0], y: pos[1], rotation: rot, opacity: glide?.opacity ?? 1 };
}

export function ringOf(glide: GlideFrame | undefined): Ring | undefined {
  return glide && glide.ring > 0 ? { color: glide.color, opacity: glide.ring } : undefined;
}

/** A point inside a stack, `local` to it, on the table. */
function inStack(local: Point, stack: Place): [number, number] {
  const [c, s] = turnBy(stack.rot);
  return [stack.pos[0] + local[0] * c - local[1] * s, stack.pos[1] + local[0] * s + local[1] * c];
}

/** A point on the table, as seen from inside a stack. */
function fromStack(point: Point, stack: Place): [number, number] {
  const [c, s] = turnBy(-stack.rot);
  const [dx, dy] = [point[0] - stack.pos[0], point[1] - stack.pos[1]];
  return [dx * c - dy * s, dx * s + dy * c];
}

function turnBy(degrees: number): [number, number] {
  const r = (degrees * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}
