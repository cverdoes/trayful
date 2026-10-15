// Pure layout and colour rules for drawing a component's face, kept out of the
// Konva components so they can be unit tested.
import type { ComponentType, Layer } from '@trayful/formats/browser';

export const DEFAULT_FILL = '#f4f1ea';
export const BACK_FILL = '#3b4252';

/** Where a box of `length` starts so that it sits on `at` with the given alignment. */
export function boxStart(at: number, align: 'start' | 'center' | 'end', length: number): number {
  if (align === 'center') return at - length / 2;
  return align === 'end' ? at - length : at;
}

/** A layer's `size`: one number for a square, or a width and height. */
export function layerSize(
  size: number | [number, number] | undefined,
  fallback: [number, number],
): [number, number] {
  if (size === undefined) return fallback;
  return typeof size === 'number' ? [size, size] : size;
}

/**
 * The colour a component is filled with: the shown face's own fill, else the type's fill
 * (front only), else a default. A back the type does not define is the plain back colour.
 */
export function fillOf(
  type: ComponentType,
  showBack: boolean,
  resolve: (color: string | undefined) => string | undefined,
): string {
  const face = showBack ? type.back : type.front;
  const own = resolve(face?.fill);
  if (own !== undefined) return own;
  if (showBack && !type.back) return BACK_FILL;
  const typeFill = showBack ? undefined : resolve(type.fill);
  if (typeFill !== undefined) return typeFill;
  if (type.base === 'zone') return 'transparent';
  return showBack ? BACK_FILL : DEFAULT_FILL;
}

export type TextLayer = Extract<Layer, { text: string }>;
export type ImageLayer = Extract<Layer, { image: string }>;

/** Large box used to anchor centred or right-aligned text on a point. */
const ANCHOR_BOX = 400;

const H_ALIGN = { left: 'start', center: 'center', right: 'end' } as const;
const V_ALIGN = { top: 'start', middle: 'center', bottom: 'end' } as const;

/**
 * Where a text layer's box goes. Text without a width does not wrap: it sits in a
 * wide box placed so the text lines up on its anchor point as aligned.
 */
export function textBox(layer: TextLayer) {
  const [ax, ay] = layer.at ?? [0, 0];
  const align = layer.align ?? 'left';
  const valign = layer.valign ?? 'top';
  const width = layer.width ?? ANCHOR_BOX;
  return {
    x: layer.width === undefined ? boxStart(ax, H_ALIGN[align], width) : ax,
    y: boxStart(ay, V_ALIGN[valign], ANCHOR_BOX),
    width,
    height: valign === 'top' ? undefined : ANCHOR_BOX,
    align,
    valign,
    wrap: layer.width === undefined ? 'none' : 'word',
  };
}

/** Konva's font style for a text layer: `bold`, `italic`, both, or `normal`. */
export function fontStyle(font: TextLayer['font']): string {
  const style = [font?.weight === 'bold' ? 'bold' : '', font?.style === 'italic' ? 'italic' : '']
    .filter(Boolean)
    .join(' ');
  return style || 'normal';
}

/**
 * Where an image goes in its box `[x, y, w, h]`, given its natural size: stretched to
 * the box, contained in it, or (the default) covering it, cropped to the box's shape.
 */
export function imageBox(
  fit: ImageLayer['fit'],
  [x, y, w, h]: [number, number, number, number],
  [iw, ih]: [number, number],
) {
  if (fit === 'stretch') return { x, y, width: w, height: h };
  if (fit === 'contain') {
    const scale = Math.min(w / iw, h / ih);
    const [width, height] = [iw * scale, ih * scale];
    return { x: x + (w - width) / 2, y: y + (h - height) / 2, width, height };
  }
  const scale = Math.max(w / iw, h / ih);
  const [cw, ch] = [w / scale, h / scale];
  return {
    x,
    y,
    width: w,
    height: h,
    crop: { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch },
  };
}
