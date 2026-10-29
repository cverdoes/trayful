// What one side of a component looks like, worked out from its properties and data:
// colours resolved, templates filled, images found and tiles picked. The app paints
// a drawing as it is, so it holds every decision about how a component looks.
import { backOf, isValued, valueIndex, valuesOf, type Asset, type Assets } from './component.js';
import { renderTemplate } from './fields.js';
import type { ComponentType, ImageRef, Label, Layer, Scalar } from './schemas.js';

export const DEFAULT_FILL = '#f4f1ea';
export const BACK_FILL = '#3b4252';
const OUTLINE = '#5c5346';

type Data = Record<string, Scalar | undefined>;
type Fit = 'cover' | 'contain' | 'stretch';
type Font = NonNullable<Extract<Layer, { text: string }>['font']>;

/** One tile of an image cut into `rows` × `cols`. */
export interface Tile {
  index: number;
  rows: number;
  cols: number;
}

interface Placement {
  at: [number, number];
  rotate: number;
  opacity: number;
}

export interface DrawText extends Placement {
  kind: 'text';
  text: string;
  width?: number;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  font?: Font;
  color: string;
}

export interface DrawImage extends Placement {
  kind: 'image';
  /** Path inside the project folder. */
  file: string;
  tile?: Tile;
  /** Drawn size; undefined fills the face. */
  size?: number | [number, number];
  fit: Fit;
}

export interface DrawShape extends Placement {
  kind: 'shape';
  shape: Extract<Layer, { shape: string }>['shape'];
  size?: number | [number, number];
  r?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export type DrawLayer = DrawText | DrawImage | DrawShape;

export interface Drawing {
  outline: NonNullable<NonNullable<ComponentType['face']>['shape']>;
  corner: number;
  fill: string;
  stroke: string;
  dashed: boolean;
  /** Drawn bottom first: the face image, then advanced layers, then labels. */
  layers: DrawLayer[];
  /** A plain pattern for a back the component does not describe. */
  plainBack: boolean;
  /** A die's or counter's value, written large in the middle when no image shows it. */
  valueText?: string;
}

export interface Shown {
  face: 'up' | 'down';
  data?: Data;
  value?: string | number;
}

/** How one side of a component looks, with everything resolved. */
export function drawingOf(type: ComponentType, shown: Shown, assets: Assets): Drawing {
  const data = shown.data ?? {};
  const back = type.flippable !== undefined && shown.face === 'down';
  const side = back ? backOf(type) : type.face;
  const color = (value: string | undefined) => resolveColor(value, data, assets.colors);
  const context: Context = { type, data, assets, value: shown.value };
  const layers = [
    ...optional(side?.image && faceImage(side.image, context)),
    ...(side?.layers ?? []).flatMap((layer) => drawLayer(layer, context)),
    ...(side?.labels ?? []).flatMap((label) => drawLabel(label, context)),
  ];
  return {
    outline: type.face?.shape ?? 'rect',
    corner: type.face?.corner ?? 0,
    fill: color(side?.fill) ?? defaultFill(type, back),
    // A stamp is only its mark, with no card around it unless it asks for one.
    stroke: color(side?.stroke) ?? (type.is === 'stamp' ? 'transparent' : OUTLINE),
    dashed: type.is === 'zone',
    layers,
    plainBack: back && side === undefined,
    valueText:
      isValued(type) && !showsValue(side?.image, context) && shown.value !== undefined
        ? String(shown.value)
        : undefined,
  };
}

function defaultFill(type: ComponentType, back: boolean): string {
  if (back) return BACK_FILL;
  return type.is === 'zone' || type.is === 'stamp' ? 'transparent' : DEFAULT_FILL;
}

interface Context {
  type: ComponentType;
  data: Data;
  assets: Assets;
  value: string | number | undefined;
}

function optional<T>(value: T | undefined | false | ''): T[] {
  return value ? [value] : [];
}

const UPRIGHT: Placement = { at: [0, 0], rotate: 0, opacity: 1 };

/** The image covering a face, or the tile of it this component shows. */
function faceImage(ref: ImageRef, { type, data, assets, value }: Context): DrawImage | undefined {
  const name = typeof ref === 'string' ? ref : ref.asset;
  const asset = assets.images[name];
  if (!asset) return undefined;
  const index = tileIndex(ref, asset, { type, data, value });
  return {
    kind: 'image',
    ...UPRIGHT,
    file: asset.file,
    tile: index === undefined ? undefined : { index, rows: asset.rows, cols: asset.cols },
    fit: (typeof ref === 'object' ? ref.fit : undefined) ?? 'cover',
  };
}

/** Whether a face image already shows a die's or counter's value, as the tile of it. */
function showsValue(ref: ImageRef | undefined, { type, assets }: Context): boolean {
  if (!ref || !isValued(type)) return false;
  const asset = assets.images[typeof ref === 'string' ? ref : ref.asset];
  if (!asset) return false;
  if (typeof ref === 'string') return asset.rows * asset.cols > 1;
  const fixed = ref.row !== undefined || typeof ref.tile === 'number' || ref.tile === 'instance';
  return !fixed && (ref.tile === 'value' || asset.rows * asset.cols > 1);
}

/**
 * Which tile of an image a face shows: a fixed one, the component's own `tile`, or
 * the tile of a die's or counter's value, which is also what a tiled image on a die
 * or counter shows when it names no tile. Undefined shows the whole image.
 */
function tileIndex(
  ref: ImageRef,
  asset: Asset,
  { type, data, value }: Pick<Context, 'type' | 'data' | 'value'>,
): number | undefined {
  const tiles = asset.rows * asset.cols;
  const pick = (index: number | undefined) =>
    index === undefined || !Number.isInteger(index)
      ? undefined
      : Math.min(Math.max(index, 0), tiles - 1);
  if (typeof ref === 'object' && ref.row !== undefined && ref.col !== undefined) {
    return pick(ref.row * asset.cols + ref.col);
  }
  const tile = typeof ref === 'object' ? ref.tile : undefined;
  if (typeof tile === 'number') return pick(tile);
  if (tile === 'instance') return pick(Number(data.tile ?? 0));
  const spec = valuesOf(type);
  if (spec && (tile === 'value' || tiles > 1)) {
    return pick(Math.max(valueIndex(spec, value), 0));
  }
  return undefined;
}

/** An advanced layer, unless its `when` hides it or it comes out empty. */
function drawLayer(layer: Layer, { data, assets }: Context): DrawLayer[] {
  if (!isShown(layer.when, data)) return [];
  const placement: Placement = {
    at: layer.at ?? [0, 0],
    rotate: layer.rotate ?? 0,
    opacity: layer.opacity ?? 1,
  };
  const color = (value: string | undefined) => resolveColor(value, data, assets.colors);
  if ('text' in layer) {
    const text = renderTemplate(layer.text, data);
    return text ? [textLayer(layer, text, placement, color(layer.color))] : [];
  }
  if ('image' in layer) {
    const name = renderTemplate(layer.image, data).trim();
    if (!name) return [];
    const file = assets.images[name]?.file ?? name;
    return [{ kind: 'image', ...placement, file, size: layer.size, fit: layer.fit ?? 'cover' }];
  }
  const stroke = color(layer.stroke);
  return [
    {
      kind: 'shape',
      ...placement,
      shape: layer.shape,
      size: layer.size,
      r: layer.r,
      fill: color(layer.fill),
      stroke,
      strokeWidth: layer.strokeWidth ?? (stroke ? 0.3 : 0),
    },
  ];
}

function drawLabel(label: Label, context: Context): DrawLayer[] {
  const text = label.field === undefined ? (label.text ?? '') : `{{${label.field}}}`;
  return drawLayer({ ...label, text }, context);
}

function textLayer(
  layer: Pick<Label, 'width' | 'align' | 'valign' | 'font'>,
  text: string,
  placement: Placement,
  color: string | undefined,
): DrawText {
  return {
    kind: 'text',
    ...placement,
    text,
    width: layer.width,
    align: layer.align ?? 'left',
    valign: layer.valign ?? 'top',
    font: layer.font,
    color: color ?? '#111',
  };
}

/** Resolves a colour value: fills `{{field}}` templates, then looks names up in the colours. */
export function resolveColor(
  value: string | undefined,
  data: Data,
  colors: Record<string, string>,
): string | undefined {
  if (!value) return undefined;
  const text = renderTemplate(value, data).trim();
  if (!text) return undefined;
  return colors[text] ?? text;
}

/** A `when` condition: shown unless it renders empty, `false` or `0`. */
export function isShown(when: string | undefined, data: Data): boolean {
  if (when === undefined) return true;
  const text = renderTemplate(when, data).trim();
  return text !== '' && text !== 'false' && text !== '0';
}
