import {
  accepts,
  allSpots,
  CENTRE,
  snapFor,
  surfaceOf,
  type Command,
  type SnapSpot,
  type Stack,
  type TableObject,
  type TableState,
} from '@trayful/core';
import { sidesOf, valuesOf } from '@trayful/formats/browser';
import { dropTarget, facePiece, pieceSize, type Types } from '../render/geometry';
import { toSurface } from './surfaces';

export type Vec = [number, number];

/** Below this distance in millimetres a drag counts as a click. */
export const CLICK_SLOP = 0.8;

/** Where pieces are going while dragged: the spots they could snap to, sized like the piece. */
export interface SnapHint {
  /** The surface the pieces are dragged across, whose tile shows the spots. */
  surface: string;
  spots: SnapSpot[];
  size: [number, number];
}

/** How close in millimetres a dropped piece must be to a spot to snap into it. */
function snapRadius(size: [number, number]): number {
  return Math.max(8, Math.min(size[0], size[1]) / 2);
}

/** The spots on its own surface a dragged object could snap to, apart from those on objects being moved. */
export function snapHint(
  table: TableState,
  types: Types,
  object: TableObject,
  ignore: ReadonlySet<string>,
): SnapHint | undefined {
  const piece = facePiece(table, object);
  const type = piece && types[piece.type];
  const surface = surfaceOf(object);
  const spots = allSpots(table, types, surface).filter(
    (s) => !ignore.has(s.owner) && accepts(s, type),
  );
  return spots.length ? { surface, spots, size: pieceSize(table, types, object) } : undefined;
}

/** What is dropped where, to find the spot it snaps to. */
interface Drop {
  object: TableObject;
  /** Where on `surface` it is let go. */
  point: Vec;
  surface: string;
  ignore: ReadonlySet<string>;
  group: boolean;
}

/** The spot a drop at `point` snaps to. Groups only snap into free areas. */
export function snapAt(table: TableState, types: Types, drop: Drop): SnapSpot | undefined {
  const piece = facePiece(table, drop.object);
  const radius = snapRadius(pieceSize(table, types, drop.object));
  const spot = snapFor(table, types, {
    type: piece && types[piece.type],
    point: drop.point,
    radius,
    ignore: drop.ignore,
    surface: drop.surface,
  });
  return spot && (spot.area || !drop.group) ? spot : undefined;
}

/**
 * Where a drag ended on another surface than it started on: at a point of that
 * surface's tile, or on its chip, which leaves the place to the table.
 */
export interface Elsewhere {
  surface: string;
  point?: Vec;
}

/** Objects dragged across the table and let go. */
export interface Move {
  /** The objects picked up, in any order. */
  moved: string[];
  /** The one under the pointer, which decides where the others go. */
  lead: string;
  by: Vec;
  /** Everything travelling with the drag, riders included: these offer no spots. */
  ignore: ReadonlySet<string>;
  /** Dropped on the hand tray of this player. */
  hand?: string;
  /** Dropped on another surface. */
  onto?: Elsewhere;
}

/**
 * What a drop does: into the hand, to free room on the surface whose chip it was
 * dropped on, onto a pile of the same kind, into a snap spot (only the lead
 * object), or else shifted, recording a free area it lands in. A drop on another
 * surface's tile does the same there, the lead object landing under the pointer.
 */
export function moveCommands(table: TableState, types: Types, move: Move): Command[] {
  const ordered = move.moved.toSorted((a, b) => table.objects[a]!.z - table.objects[b]!.z);
  if (move.hand) return [{ type: 'move', ids: ordered, to: `hand:${move.hand}` }];
  const { onto } = move;
  if (onto && !onto.point) return [{ type: 'move', ids: ordered, to: toSurface(onto.surface) }];
  const lead = table.objects[move.lead]!;
  const point: Vec = onto?.point ?? [lead.pos[0] + move.by[0], lead.pos[1] + move.by[1]];
  const surface = onto?.surface ?? surfaceOf(lead);
  const target = dropTarget(table, types, { dragged: move.moved, point, surface });
  if (target) return [{ type: 'stack', ids: ordered, onto: target.id }];
  const group = move.moved.length > 1;
  const spot = snapAt(table, types, { object: lead, point, surface, ignore: move.ignore, group });
  if (spot && !spot.area) return [{ type: 'move', ids: [move.lead], to: spot.ref }];
  const into = spot ? { into: spot.ref } : {};
  if (!onto) return [{ type: 'move', ids: ordered, by: move.by, ...into }];
  // The first object named goes to the position; the others keep their place around it.
  const ids = [move.lead, ...ordered.filter((id) => id !== move.lead)];
  return [{ type: 'move', ids, to: [round(point[0]), round(point[1])], surface, ...into }];
}

/** A card dragged off a stack and let go at `local`, its position inside the stack. */
export interface Draw {
  stack: Stack;
  piece: string;
  local: Vec;
  hand?: string;
  /** Dropped on another surface than the stack's. */
  onto?: Elsewhere;
}

/**
 * What taking a card off a stack does: drawing the top card of a pile, or taking
 * any card from a fan or spread, to a hand, a pile, a snap spot or the table
 * where it was let go: on the stack's surface, or on another one's tile or chip.
 * `select` is the card to select afterwards.
 */
export function drawCommands(
  table: TableState,
  types: Types,
  { stack, piece, local, hand, onto }: Draw,
): { commands: Command[]; select?: string } {
  const surface = onto?.surface ?? surfaceOf(stack);
  const take = (to: Vec | string): Command =>
    piece === stack.items.at(-1) && !stack.layout
      ? { type: 'draw', from: stack.id, ...landing(to, surface) }
      : { type: 'take', id: piece, ...landing(to, surface) };
  if (hand) return { commands: [take(`hand:${hand}`)] };
  if (onto && !onto.point) return { commands: [take(toSurface(surface))] };
  const point = onto?.point ?? fromStack(stack, local);
  const target = dropTarget(table, types, { dragged: [stack.id], point, surface });
  if (target) return { commands: [take(point), { type: 'stack', ids: [piece], onto: target.id }] };
  const ignore = new Set([stack.id]);
  const spot = snapAt(table, types, { object: stack, point, surface, ignore, group: false });
  return {
    commands: [take(spot && !spot.area ? spot.ref : point), ...intoArea(piece, spot)],
    select: piece,
  };
}

/**
 * What playing a card from the hand at `point` on a surface does: onto a pile
 * (unless played face down), into a snap spot, or onto the surface where it was dropped.
 */
export function handDropCommands(
  table: TableState,
  types: Types,
  drop: { id: string; point: Vec; surface: string; faceDown: boolean },
): Command[] {
  const { id, point, surface, faceDown } = drop;
  const piece = table.objects[id];
  if (piece?.kind !== 'piece') return [];
  const target = dropTarget(table, types, { dragged: [id], point, surface });
  if (target && !faceDown) return [{ type: 'stack', ids: [id], onto: target.id }];
  const ignore = new Set([id]);
  const spot = snapAt(table, types, { object: piece, point, surface, ignore, group: false });
  const to = spot && !spot.area ? spot.ref : ([round(point[0]), round(point[1])] as Vec);
  const play: Command = {
    type: 'move',
    ids: [id],
    ...landing(to, surface),
    ...(faceDown ? { face: 'down' } : {}),
  };
  return target
    ? [play, { type: 'stack', ids: [id], onto: target.id }]
    : [play, ...intoArea(id, spot)];
}

/**
 * A piece put down at a point inside an area (drawn from a stack or played from
 * a hand) is then recorded in it where it lies, so a row lines it up and a bag
 * takes it in straight away.
 */
function intoArea(id: string, spot: SnapSpot | undefined): Command[] {
  return spot?.area ? [{ type: 'move', ids: [id], by: [0, 0], into: spot.ref }] : [];
}

/**
 * Where a piece is put: a place named by a string says its own surface; a position
 * needs the surface spelled out, unless it is the Centre.
 */
export function landing(to: Vec | string, surface: string): { to: Vec | string; surface?: string } {
  return typeof to === 'string' || surface === CENTRE ? { to } : { to, surface };
}

/** Double-click rolls a die that can be rolled, and flips anything flippable. */
export function doubleClickCommand(
  table: TableState,
  types: Types,
  object: TableObject,
): Command | undefined {
  const piece = facePiece(table, object);
  const type = piece && types[piece.type];
  if (!type || object.locked) return undefined;
  if (object.kind === 'piece' && valuesOf(type)?.controls.includes('roll'))
    return { type: 'roll', id: object.id };
  return sidesOf(type) === 2 ? { type: 'flip', ids: [object.id] } : undefined;
}

/** The unlocked objects whose centres lie in the box between two corners. */
export function inBox(objects: TableObject[], from: Vec, to: Vec): string[] {
  const [x0, x1] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
  const [y0, y1] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
  return objects
    .filter(
      (o) => !o.locked && o.pos[0] >= x0 && o.pos[0] <= x1 && o.pos[1] >= y0 && o.pos[1] <= y1,
    )
    .map((o) => o.id);
}

/** Where a card in a stack is on the table, given its position inside the (rotated) stack. */
export function fromStack(stack: Stack, local: Vec): Vec {
  const rad = (stack.rot * Math.PI) / 180;
  return [
    stack.pos[0] + local[0] * Math.cos(rad) - local[1] * Math.sin(rad),
    stack.pos[1] + local[0] * Math.sin(rad) + local[1] * Math.cos(rad),
  ];
}

/** Rounds to a tenth of a millimetre. */
function round(n: number): number {
  return Math.round(n * 10) / 10;
}
