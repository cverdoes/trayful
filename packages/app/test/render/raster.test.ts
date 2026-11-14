import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyOf,
  drawnFrom,
  MAX_RASTER_SIDE,
  rasterScale,
  SETTLE_MS,
} from '../../src/render/raster';

// Painting needs a canvas and `createImageBitmap`, which only a browser has.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }) }),
  });
  vi.stubGlobal('createImageBitmap', (canvas: { width: number }) =>
    Promise.resolve({ width: canvas.width }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('rasterScale', () => {
  it('paints a vector image at the size it is shown', () => {
    expect(rasterScale([600, 400], 0.5, true)).toBe(0.5);
    expect(rasterScale([600, 400], 3, true)).toBe(3);
  });

  it('stops growing a copy at the largest side it may have', () => {
    expect(rasterScale([2048, 1024], 4, true)).toBe(MAX_RASTER_SIDE / 2048);
  });

  it('only shrinks a bitmap, never enlarges it', () => {
    expect(rasterScale([600, 400], 0.25, false)).toBe(0.25);
    expect(rasterScale([600, 400], 2, false)).toBeUndefined();
  });

  it('leaves images without a size alone', () => {
    expect(rasterScale([0, 0], 1, true)).toBeUndefined();
    expect(rasterScale([600, 400], 0, true)).toBeUndefined();
  });
});

describe('copyOf', () => {
  const image = () => ({ naturalWidth: 100, naturalHeight: 50 }) as HTMLImageElement;

  it('draws the image itself until a copy is painted, then the copy', async () => {
    const board = image();
    expect(copyOf(board, 2)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(copyOf(board, 2)).toEqual({ bitmap: { width: 200 }, k: 2 });
  });

  it('lets the nearest size stand in while the zoom moves', async () => {
    const board = image();
    copyOf(board, 1);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    copyOf(board, 4);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(copyOf(board, 1.2)?.k).toBe(1);
    expect(copyOf(board, 3)?.k).toBe(4);
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    // Only the last size asked for is painted once the zoom rests.
    expect(copyOf(board, 3)?.k).toBe(3);
    expect([1, 3, 4]).toContain(copyOf(board, 1.2)?.k);
  });

  it('keeps a few sizes of an image, letting go of the one used longest ago', async () => {
    const board = image();
    for (const k of [1, 2, 3, 4]) {
      copyOf(board, k);
      await vi.advanceTimersByTimeAsync(SETTLE_MS);
    }
    expect(copyOf(board, 1)?.k).toBe(2);
  });
});

describe('drawnFrom', () => {
  it('draws the same part of the copy as of the image', async () => {
    const dice = { naturalWidth: 300, naturalHeight: 200 } as HTMLImageElement;
    const tile = { x: 100, y: 100, width: 100, height: 100 };
    expect(drawnFrom(dice, tile, 50, true)).toEqual({ image: dice, crop: tile });
    await vi.advanceTimersByTimeAsync(SETTLE_MS);
    expect(drawnFrom(dice, tile, 50, true).crop).toEqual({ x: 50, y: 50, width: 50, height: 50 });
  });

  it('draws a bitmap shown at full size as it is', () => {
    const photo = { naturalWidth: 300, naturalHeight: 200 } as HTMLImageElement;
    const whole = { x: 0, y: 0, width: 300, height: 200 };
    expect(drawnFrom(photo, whole, 600, false).image).toBe(photo);
  });
});
