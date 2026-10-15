// What pressing the pointer on the designer canvas does: picks a layer or a snap
// target, and starts dragging it, one of its handles, or a new snap spot. A drag
// is a `Gesture` that turns each pointer position into the type as it would be.
import type { ComponentType, Layer } from '@trayful/formats/browser';
import { sizeOf } from '../render/geometry';
import { layersOf, setIn, type Side } from './edit';
import { layerAt, layerBounds, type Box } from './layout';
import {
  handlesOf,
  keepFixedCorner,
  movedLayer,
  pivotOf,
  resizedLayer,
  rotatedLayer,
  snapBox,
  snapLines,
  snapPoint,
  unrotate,
  type Guide,
  type Point,
} from './manipulate';
import { draggedTarget, spotsOf, targetHandles, withPoint, type TargetHandle } from './snaps';

/** What is selected on the canvas: a layer on one side, or a snap target on the front. */
export interface Selection {
  side: Side;
  layer?: number;
  target?: number;
}

/** A drag in progress: the type as it would be with the pointer at a point. */
export type Gesture = (point: Point) => { type: ComponentType; guides: Guide[] };

/** Where the pointer went down, in millimetres on one side, and how close counts as a hit. */
export interface Press {
  type: ComponentType;
  side: Side;
  point: Point;
  /** Millimetres within which the pointer is on a handle, and things snap. */
  tolerance: number;
}

export interface PressResult {
  selection: Selection;
  gesture?: Gesture;
  /** The type changed by the press itself (a spot added), kept even if the pointer never moves. */
  changed?: ComponentType;
}

/** The rotate handle, straight above the middle of the box's top edge. */
export function rotateHandle(box: Box, tolerance: number): Point {
  return [box.x + box.w / 2, box.y - 3 * tolerance];
}

const near = (a: Point, b: Point, tolerance: number) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;

const inside = ([x, y]: Point, b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/**
 * Decides what a press does, given what is selected: a handle of the selection
 * drags that handle; anything else picks what is under the pointer and drags it.
 */
export function press(input: Press, selection: Selection): PressResult {
  const { side } = input;
  const onSide = selection.side === side;
  if (onSide && selection.target !== undefined) {
    const result = pressTarget(input, selection.target);
    if (result) return result;
  }
  if (onSide && selection.layer !== undefined) {
    const gesture = pressLayer(input, selection.layer);
    if (gesture) return { selection, gesture };
  }
  return pick(input);
}

/** Picks the topmost layer under the pointer and starts moving it, else a snap target's spot. */
function pick(input: Press): PressResult {
  const { type, side, point, tolerance } = input;
  const face = sizeOf(type);
  const index = layerAt(layersOf(type, side), point, face);
  const target = side === 'front' ? targetAt(type, point, tolerance) : undefined;
  if (target !== undefined) return { selection: { side, target } };
  if (index === undefined) return { selection: { side } };
  return { selection: { side, layer: index }, gesture: moveLayer(input, index) };
}

function targetAt(type: ComponentType, point: Point, tolerance: number): number | undefined {
  const index = (type.snap ?? []).findIndex(
    (t) =>
      targetHandles(t).some(([, p]) => near(p, point, tolerance)) ||
      spotsOf(t).some((p) => near(p, point, tolerance)),
  );
  return index === -1 ? undefined : index;
}

/** A press on the selected layer: its rotate handle, a resize handle, or the layer itself. */
function pressLayer(input: Press, index: number): Gesture | undefined {
  const { type, side, point, tolerance } = input;
  const face = sizeOf(type);
  const layer = layersOf(type, side)[index];
  if (!layer) return undefined;
  const pivot = pivotOf(layer, face);
  const local = unrotate(point, pivot, layer.rotate ?? 0);
  const box = layerBounds(layer, face);
  if (near(local, rotateHandle(box, tolerance), tolerance)) {
    return (p) => ({
      type: withLayer(input, index, rotatedLayer(layer, point, p, face)),
      guides: [],
    });
  }
  const handle = handlesOf(layer, box).find(([, p]) => near(local, p, tolerance))?.[0];
  if (handle) {
    const lines = snapLines(face, otherLayers(input, index));
    return (p) => {
      const turned = unrotate(p, pivot, layer.rotate ?? 0);
      // A turned layer's corners are off the face's lines, so it only snaps when upright.
      const snapped = layer.rotate
        ? { point: turned, guides: [] }
        : snapPoint(turned, lines, tolerance);
      const resized = keepFixedCorner(
        layer,
        resizedLayer(layer, handle, snapped.point, face),
        handle,
        face,
      );
      return { type: withLayer(input, index, resized), guides: snapped.guides };
    };
  }
  return inside(local, box) ? moveLayer(input, index) : undefined;
}

function moveLayer(input: Press, index: number): Gesture {
  const { type, side, point: start, tolerance } = input;
  const face = sizeOf(type);
  const layer = layersOf(type, side)[index]!;
  const lines = snapLines(face, otherLayers(input, index));
  return (p) => {
    const delta: Point = [p[0] - start[0], p[1] - start[1]];
    const box = layerBounds(movedLayer(layer, delta), face);
    const { shift, guides } = snapBox(box, lines, tolerance);
    const moved = movedLayer(layer, [delta[0] + shift[0], delta[1] + shift[1]]);
    return { type: withLayer(input, index, moved), guides };
  };
}

function otherLayers({ type, side }: Press, index: number): Layer[] {
  return layersOf(type, side).filter((_, i) => i !== index);
}

function withLayer({ type, side }: Press, index: number, layer: Layer): ComponentType {
  return setIn(type, [side, 'layers', index], layer);
}

/**
 * A press with a snap target selected: one of its handles drags that handle; in a
 * list of points, a press anywhere else adds a spot there and drags it.
 */
function pressTarget(input: Press, index: number): PressResult | undefined {
  const { type, side, point, tolerance } = input;
  const target = type.snap?.[index];
  if (!target) return undefined;
  const selection = { side, target: index };
  const hit = targetHandles(target).find(([, p]) => near(p, point, tolerance));
  if (hit) return { selection, gesture: dragTarget(input, index, hit[0]) };
  // Only a press on the face, away from other targets, adds a spot; others pick as usual.
  const [w, h] = sizeOf(type);
  const onFace = point[0] >= 0 && point[0] <= w && point[1] >= 0 && point[1] <= h;
  const other = targetAt(type, point, tolerance);
  if (!target.points || !onFace || (other !== undefined && other !== index)) return undefined;
  const added = setIn(type, ['snap', index], withPoint(target, snap(input, point).point));
  const handle: TargetHandle = { kind: 'point', index: target.points.length };
  return {
    selection,
    gesture: dragTarget({ ...input, type: added }, index, handle),
    changed: added,
  };
}

function dragTarget(input: Press, index: number, handle: TargetHandle): Gesture {
  const target = input.type.snap![index]!;
  return (p) => {
    const snapped = snap(input, p);
    const moved = draggedTarget(target, handle, snapped.point);
    return { type: setIn(input.type, ['snap', index], moved), guides: snapped.guides };
  };
}

/** Snap spots line up with the face's edges and centre, and its grid. */
function snap({ type, tolerance }: Press, point: Point) {
  return snapPoint(point, snapLines(sizeOf(type), []), tolerance);
}
