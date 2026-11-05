// The image on a side of a component, as the designer offers it: which image, and
// which of its tiles. Pure, so the choices and what they write can be tested.
import type { Asset, ImageRef } from '@trayful/formats/browser';

/**
 * Which part of an image a side shows: all of it, one tile, the tile each
 * component picks in the inventory, or the tile of a die's or counter's value.
 */
export type TileMode = 'whole' | 'tile' | 'instance' | 'value';

type Fit = 'cover' | 'contain' | 'stretch';

export interface ImageChoice {
  asset: string;
  mode: TileMode;
  /** The tile shown in `tile` mode, counted left to right, then top to bottom, from 0. */
  tile: number;
  fit?: Fit;
}

/** How an image reference reads in the designer; tiles given by row and column become an index. */
export function imageChoice(
  ref: ImageRef | undefined,
  images: Record<string, Asset>,
  valued: boolean,
): ImageChoice | undefined {
  if (ref === undefined) return undefined;
  const { asset, tile, row, col, fit } = typeof ref === 'string' ? { asset: ref } : ref;
  const image = images[asset];
  const fitted = fit ? { fit } : {};
  if (typeof tile === 'number') return { asset, mode: 'tile', tile, ...fitted };
  if (tile !== undefined) return { asset, mode: tile, tile: 0, ...fitted };
  if (row !== undefined || col !== undefined) {
    const cols = image?.cols ?? 1;
    return { asset, mode: 'tile', tile: (row ?? 0) * cols + (col ?? 0), ...fitted };
  }
  // A tiled image on a die or counter that names no tile shows the tile of its value.
  const mode = image ? tileModes(image, valued)[0]! : 'whole';
  return { asset, mode, tile: 0, ...fitted };
}

/** The reference a choice writes, the short way (just the name) when that says it all. */
export function imageRef({ asset, mode, tile, fit }: ImageChoice): ImageRef {
  let ref: ImageRef;
  if (mode === 'whole') ref = fit ? { asset, fit } : asset;
  else ref = { asset, tile: mode === 'tile' ? tile : mode, ...(fit ? { fit } : {}) };
  return ref;
}

/** How many tiles an image is cut into. */
export const tileCount = (image: Pick<Asset, 'rows' | 'cols'>) => image.rows * image.cols;

/**
 * The tile modes worth offering for an image, the default first: tiles only when
 * it has several, and on a die or counter, the tile of its value in place of the
 * whole sheet, which is what such an image shows when it names no tile.
 */
export function tileModes(image: Pick<Asset, 'rows' | 'cols'>, valued: boolean): TileMode[] {
  if (tileCount(image) === 1) return ['whole'];
  return valued ? ['value', 'tile', 'instance'] : ['whole', 'tile', 'instance'];
}

/** The same choice on another image: kept where it still makes sense, else the whole image. */
export function withAsset(
  choice: ImageChoice | undefined,
  asset: string,
  image: Pick<Asset, 'rows' | 'cols'>,
  valued: boolean,
): ImageChoice {
  const modes = tileModes(image, valued);
  const mode = choice && modes.includes(choice.mode) ? choice.mode : modes[0]!;
  const tile = choice && choice.tile < tileCount(image) ? choice.tile : 0;
  return { asset, mode, tile, ...(choice?.fit ? { fit: choice.fit } : {}) };
}
