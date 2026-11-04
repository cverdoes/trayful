// Where things are on the designer canvas, in millimetres on a face.
import type { Layer } from '@trayful/formats/browser';
import { boxStart, layerSize } from '../render/face';

/** 1 typographic point in millimetres, as the renderer uses it. */
const PT = 0.3528;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box a layer covers on its face, for outlining the selected layer and
 * finding the layer under the pointer. Text without a width is measured roughly,
 * from its length and font size, which is close enough to point at it.
 */
export function layerBounds(layer: Layer, face: [number, number]): Box {
  const [x, y] = layer.at ?? [0, 0];
  if ('text' in layer) return textBounds(layer, x, y);
  if ('image' in layer) {
    const [w, h] = layerSize(layer.size, face);
    return { x, y, w, h };
  }
  if (layer.r !== undefined)
    return { x: x - layer.r, y: y - layer.r, w: 2 * layer.r, h: 2 * layer.r };
  const [w, h] = layerSize(layer.size, [0, 0]);
  return { x, y, w, h };
}

const H_ALIGN = { left: 'start', center: 'center', right: 'end' } as const;
const V_ALIGN = { top: 'start', middle: 'center', bottom: 'end' } as const;

function textBounds(layer: Extract<Layer, { text: string }>, x: number, y: number): Box {
  const size = (layer.font?.size ?? 10) * PT;
  const lines = layer.text.split('\n');
  const longest = Math.max(...lines.map((line) => line.length));
  const w = layer.width ?? Math.max(size, longest * size * 0.55);
  const h = size * 1.2 * (layer.width === undefined ? lines.length : Math.max(lines.length, 2));
  return {
    x: layer.width === undefined ? boxStart(x, H_ALIGN[layer.align ?? 'left'], w) : x,
    y: boxStart(y, V_ALIGN[layer.valign ?? 'top'], h),
    w,
    h,
  };
}

/** The topmost layer under a point on the face, by index, if any. */
export function layerAt(
  layers: Layer[],
  [px, py]: [number, number],
  face: [number, number],
): number | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const b = layerBounds(layers[i]!, face);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return i;
  }
  return undefined;
}

/** Millimetres to pixels that fit `content` into `space`, leaving a margin around it. */
export function fitScale(content: [number, number], space: [number, number], margin = 24): number {
  const [cw, ch] = content;
  const [sw, sh] = space;
  return Math.max(0.1, Math.min((sw - 2 * margin) / cw, (sh - 2 * margin) / ch));
}
