// Pure layout and colour rules for drawing a component's face, kept out of the
// Konva components so they can be unit tested.
import type { ComponentType } from '@trayful/formats/browser';

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
