import {
  GLIDE_MS,
  onTable,
  surfaceOf,
  type Piece,
  type TableObject,
  type TableState,
} from '@trayful/core';

/** How long the ring in the mover's colour stays on what they changed, fading at the end. */
export const RING_MS = 2400;
/** More changes than this at once, such as a whole new table, are shown without gliding. */
const MAX_GLIDES = 40;

type Vec = readonly [number, number];

/** Where something lay and how it was turned, on its surface. */
export interface Place {
  pos: Vec;
  rot: number;
}

/**
 * A piece or stack someone else changed: where it was, when the change came in, and
 * the colour of who made it. It slides from `from` to wherever it lies now.
 */
export interface Glide {
  at: number;
  color: string;
  /** Where it was; absent when it stays put and only shows the ring. */
  from?: Place;
  /** It came from nowhere this viewer could see, such as another player's hand. */
  appear?: boolean;
  /** It was turned over: how it looked before, shown for the first half of the turn. */
  flipFrom?: Piece;
  /** Whether it gets a ring: only things lying on the table do, not cards inside a stack. */
  ring: boolean;
}

/** When a change came in, the colour of who made it, and the stacks pieces came out of. */
export interface GlideOptions {
  now: number;
  color: string;
  /** Show the ring but nothing moving, for people who asked for less motion. */
  still?: boolean;
  /** The stack each piece came out of, for cards whose name changed as they came out face up. */
  from?: Readonly<Record<string, string>>;
}

/** How a gliding object looks at one moment. */
export interface GlideFrame {
  pos: Vec;
  rot: number;
  scale: number;
  opacity: number;
  /** Squeezes the object sideways while it turns over. */
  flipScale: number;
  /** How it looked before it was turned over, while that side still shows. */
  shows?: Piece;
  /** How strongly the ring shows, from 0 to 1; 0 when it has none. */
  ring: number;
  /** The colour of who made the change. */
  color: string;
}

/**
 * The glides for a change someone else made from `before` to `after`, kept with those of
 * `glides` still under way. Each viewer works it out from the two views it already had,
 * and the server's word on which stack a card came out of (by the name this viewer knows
 * it by), so it shows nothing more than that viewer could see: a card from a hidden hand
 * appears, and one drawn from a pile slides out of the pile.
 */
export function glidesFor(
  glides: Readonly<Record<string, Glide>>,
  before: TableState,
  after: TableState,
  options: GlideOptions,
): Record<string, Glide> {
  const { now } = options;
  const next = Object.fromEntries(Object.entries(glides).filter(([, g]) => now < g.at + RING_MS));
  const changed = Object.values(after.objects).filter((o) => changedSince(before, after, o));
  if (changed.length === 0 || changed.length > MAX_GLIDES) return next;
  for (const object of changed) {
    const glide = glideOf(before, after, object, options);
    if (!glide) continue;
    const running = next[object.id];
    const was = before.objects[object.id];
    // Something still on its way starts again from where it shows now.
    if (running && glide.from && was) {
      const frame = glideFrame(running, was, now - running.at);
      if (frame) glide.from = { pos: frame.pos, rot: frame.rot };
    }
    next[object.id] = glide;
  }
  return next;
}

function glideOf(
  before: TableState,
  after: TableState,
  object: TableObject,
  { now, color, still, from: origins }: GlideOptions,
): Glide | undefined {
  const lies = onTable(object);
  const glide: Glide = { at: now, color, ring: lies };
  if (!lies && !shownInStack(after, object)) return undefined;
  if (still) return lies ? glide : undefined;
  const surface = lies ? surfaceOf(object) : stackSurface(after, object);
  // Where it lay before: by the same name, or else in the stack the server says it left.
  const wasAt =
    surface === undefined
      ? undefined
      : (placeBefore(before, object.id, surface) ??
        placeBefore(before, origins?.[object.id], surface));
  const was = before.objects[object.id];
  if (wasAt && moved(wasAt, lies ? object : undefined)) glide.from = wasAt;
  else if (!wasAt && lies) glide.appear = true;
  if (was?.kind === 'piece' && object.kind === 'piece' && was.face !== object.face && wasAt) {
    glide.flipFrom = was;
  }
  // A card that went into a stack and stays where it was shows nothing more.
  return lies || glide.from ? glide : undefined;
}

/**
 * How `glide` looks `elapsed` ms in, sliding to `to`; undefined once it is over.
 * It eases out of where it was and into where it lands, turning the short way round.
 */
export function glideFrame(glide: Glide, to: Place, elapsed: number): GlideFrame | undefined {
  if (elapsed >= RING_MS || elapsed < 0) return undefined;
  const t = Math.min(1, elapsed / GLIDE_MS);
  const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const from = glide.from ?? to;
  const turn = ((((to.rot - from.rot) % 360) + 540) % 360) - 180;
  const fade = elapsed <= GLIDE_MS ? 1 : 1 - (elapsed - GLIDE_MS) / (RING_MS - GLIDE_MS);
  const firstHalf = glide.flipFrom !== undefined && t < 0.5;
  return {
    pos: [
      from.pos[0] + (to.pos[0] - from.pos[0]) * eased,
      from.pos[1] + (to.pos[1] - from.pos[1]) * eased,
    ],
    rot: from.rot + turn * eased,
    scale: glide.appear ? 0.7 + 0.3 * eased : 1,
    opacity: glide.appear ? eased : 1,
    flipScale: glide.flipFrom ? Math.abs(Math.cos(Math.PI * t)) : 1,
    ...(firstHalf ? { shows: glide.flipFrom } : {}),
    ring: glide.ring ? Math.max(0, fade) : 0,
    color: glide.color,
  };
}

/** Milliseconds until everything gliding now has landed, so a snapshot shows where it lies. */
export function landIn(glides: Readonly<Record<string, Glide>>, now: number): number {
  return Math.max(0, ...Object.values(glides).map((g) => g.at + GLIDE_MS - now));
}

/** Whether anything about an object, or the cards in it, is different from before. */
function changedSince(before: TableState, after: TableState, object: TableObject): boolean {
  const sig = (state: TableState, o: TableObject | undefined) =>
    o === undefined
      ? ''
      : JSON.stringify([o, o.kind === 'stack' ? o.items.map((id) => state.objects[id]) : []]);
  return sig(before, before.objects[object.id]) !== sig(after, object);
}

/** Where an object lay on `surface` before: by itself, or as part of a stack lying there. */
function placeBefore(
  before: TableState,
  id: string | undefined,
  surface: string,
): Place | undefined {
  const was = id === undefined ? undefined : before.objects[id];
  if (!was) return undefined;
  const holder = was.kind === 'piece' && was.parent ? before.objects[was.parent] : was;
  if (!holder || !onTable(holder) || surfaceOf(holder) !== surface) return undefined;
  return { pos: holder.pos, rot: holder.rot };
}

/** Whether a place differs from where an object lies now; a card inside a stack always moved. */
function moved(from: Place, now: TableObject | undefined): boolean {
  if (!now) return true;
  return from.pos[0] !== now.pos[0] || from.pos[1] !== now.pos[1] || from.rot !== now.rot;
}

/** Whether a card in a stack is drawn by itself: on top of a pile, or anywhere in a spread. */
function shownInStack(state: TableState, object: TableObject): boolean {
  if (object.kind !== 'piece' || !object.parent) return false;
  const stack = state.objects[object.parent];
  if (stack?.kind !== 'stack') return false;
  return stack.layout !== undefined || stack.items.at(-1) === object.id;
}

function stackSurface(state: TableState, object: TableObject): string | undefined {
  const stack = object.kind === 'piece' && object.parent ? state.objects[object.parent] : undefined;
  return stack && onTable(stack) ? surfaceOf(stack) : undefined;
}
