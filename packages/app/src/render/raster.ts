import { useEffect, useState } from 'react';

/**
 * Copies of images painted at the size they are shown, so a redraw blits a bitmap
 * instead of painting the image again. Chrome paints an SVG image afresh on every
 * `drawImage`, filters and patterns included, and the canvas redraws every piece on
 * each step of a drag or zoom, so one board with a paper grain made the whole table
 * sluggish. A large photo shown small is copied too, so it is not shrunk every time.
 */

/**
 * The longest side of a copy, in pixels. Zoomed in further, a big image is shown
 * from a copy this size, a little soft, rather than painted afresh on every redraw.
 */
export const MAX_RASTER_SIDE = 4096;

/** How many sizes of one image are kept; the one used longest ago goes first. */
const KEPT_SIZES = 3;

/**
 * How long, in milliseconds, nobody may ask for a new size before it is painted.
 * Painting a big SVG takes long enough to stall a frame, so while the zoom moves the
 * nearest copy stands in, and the right one is painted once the zoom rests.
 */
export const SETTLE_MS = 150;

/**
 * How many times bigger than its natural size to paint a copy of an image, or
 * undefined to draw the image itself. `shown` is how many screen pixels one pixel of
 * the image covers, so the copy matches the screen pixel for pixel, up to
 * `MAX_RASTER_SIDE`. A bitmap is only ever shrunk into a copy: enlarging it adds
 * nothing.
 */
export function rasterScale(
  [width, height]: [number, number],
  shown: number,
  vector: boolean,
): number | undefined {
  if (!(width > 0 && height > 0 && shown > 0)) return undefined;
  const k = Math.min(shown, MAX_RASTER_SIDE / Math.max(width, height));
  return vector || k < 1 ? k : undefined;
}

/** A copy of an image, painted `k` times its natural size. */
export interface Copy {
  bitmap: ImageBitmap;
  k: number;
}

const copies = new WeakMap<HTMLImageElement, Map<number, ImageBitmap>>();
const wanted = new Map<HTMLImageElement, number>();
const repaintListeners = new Set<() => void>();
let settle: ReturnType<typeof setTimeout> | undefined;

function sizesOf(image: HTMLImageElement): Map<number, ImageBitmap> {
  let sizes = copies.get(image);
  if (!sizes) {
    sizes = new Map();
    copies.set(image, sizes);
  }
  return sizes;
}

/**
 * Paints the copy on a canvas, then makes a bitmap of it: a canvas drawn onto another
 * canvas can cost as much as the image it replaced, a bitmap is a plain blit.
 */
async function paint(image: HTMLImageElement, k: number): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * k));
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  keep(image, k, await createImageBitmap(canvas));
}

/** Keeps a size as the one used last, letting go of the one used longest ago. */
function keep(image: HTMLImageElement, k: number, bitmap: ImageBitmap): ImageBitmap {
  const sizes = sizesOf(image);
  sizes.delete(k);
  sizes.set(k, bitmap);
  const oldest = sizes.keys().next().value;
  if (sizes.size > KEPT_SIZES && oldest !== undefined) sizes.delete(oldest);
  return bitmap;
}

async function paintWanted(): Promise<void> {
  settle = undefined;
  const painting = [...wanted].map(([image, k]) => paint(image, k));
  wanted.clear();
  await Promise.allSettled(painting);
  for (const listener of repaintListeners) listener();
}

/** The size in `sizes` closest to `k`, counting halving and doubling as equally far. */
function nearest(sizes: number[], k: number): number | undefined {
  const distance = (size: number) => Math.abs(Math.log2(size / k));
  return sizes.reduce<number | undefined>(
    (best, size) => (best === undefined || distance(size) < distance(best) ? size : best),
    undefined,
  );
}

/**
 * The copy of `image` to draw for size `k`, or undefined to draw the image itself
 * until there is one. A missing size is painted once nobody has asked for a new
 * size for a moment, and the nearest size there is stands in until then.
 */
export function copyOf(image: HTMLImageElement, k: number): Copy | undefined {
  const sizes = sizesOf(image);
  const exact = sizes.get(k);
  if (exact) return { bitmap: keep(image, k, exact), k };
  wanted.set(image, k);
  clearTimeout(settle);
  settle = setTimeout(() => void paintWanted(), SETTLE_MS);
  const near = nearest([...sizes.keys()], k);
  return near === undefined ? undefined : { bitmap: keep(image, near, sizes.get(near)!), k: near };
}

/** A part of an image, in the image's own pixels. */
interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What to draw for the part `crop` of `image` when it fills `width` screen pixels:
 * a copy painted at that size and the same part of it, or the image itself while
 * there is no copy, or when a copy would not help.
 */
export function drawnFrom(
  image: HTMLImageElement,
  crop: Crop,
  width: number,
  vector: boolean,
): { image: CanvasImageSource; crop: Crop } {
  const k = rasterScale([image.naturalWidth, image.naturalHeight], width / crop.width, vector);
  const copy = k === undefined ? undefined : copyOf(image, k);
  if (!copy) return { image, crop };
  const part = { x: crop.x * copy.k, y: crop.y * copy.k };
  return {
    image: copy.bitmap,
    crop: { ...part, width: crop.width * copy.k, height: crop.height * copy.k },
  };
}

/** Draws again when copies that stood in for others have been replaced. */
export function useRepaints(): void {
  const [, setRepaints] = useState(0);
  useEffect(() => {
    const listener = () => setRepaints((n) => n + 1);
    repaintListeners.add(listener);
    return () => {
      repaintListeners.delete(listener);
    };
  }, []);
}
