import type { Piece } from '@trayful/core';
import {
  drawingOf,
  type Assets,
  type ComponentType,
  type DrawImage,
  type DrawLayer,
  type DrawShape,
  type DrawText,
} from '@trayful/formats/browser';
import type Konva from 'konva';
import { createContext, useContext } from 'react';
import { Circle, Ellipse, Group, Image, Path, Rect, RegularPolygon, Text } from 'react-konva';
import { fontStyle, imageBox, layerSize, textBox, tileRect } from './face';
import { sizeOf } from './geometry';
import { useProjectImage } from './images';

/** 1 typographic point in millimetres. */
const PT = 0.3528;

/** A standing figure in a 1×1 box; `meeplePath` scales it to a piece. */
const MEEPLE_PATH =
  'M0.5 0 C0.62 0 0.7 0.09 0.7 0.2 C0.7 0.27 0.67 0.32 0.62 0.36 L0.95 0.45 C1 0.47 1 0.55 0.95 0.58 L0.72 0.62 L0.9 1 L0.58 1 L0.5 0.8 L0.42 1 L0.1 1 L0.28 0.62 L0.05 0.58 C0 0.55 0 0.47 0.05 0.45 L0.38 0.36 C0.33 0.32 0.3 0.27 0.3 0.2 C0.3 0.09 0.38 0 0.5 0 Z';

/** Scales the unit meeple to `w`×`h`. Its numbers are x, y pairs, so they alternate axes. */
function meeplePath(w: number, h: number): string {
  let i = 0;
  return MEEPLE_PATH.replace(/[\d.]+/g, (n) => String(Number(n) * (i++ % 2 === 0 ? w : h)));
}

interface Props {
  piece: Piece;
  type: ComponentType;
  assets: Assets;
  /** Drawn with a strong outline when selected, a light one when under the pointer. */
  highlight?: Highlight;
}

export type Highlight = 'selected' | 'hovered';

const HIGHLIGHT = {
  selected: { stroke: '#2f81f7', strokeWidth: 1.2 },
  hovered: { stroke: '#7fb2fa', strokeWidth: 0.9 },
} as const;

/** How soft a piece's shadow is, in millimetres. */
const SHADOW_BLUR = 2;
/** The softest a shadow gets on screen, in pixels, however far the view is zoomed in. */
const MAX_SHADOW_BLUR_PX = 4;

/**
 * Screen pixels per millimetre where the components are drawn, when it changes with
 * zooming. A shadow's blur grows with the zoom, and a wide blur on every piece made
 * each redraw many times slower, so it stops growing at `MAX_SHADOW_BLUR_PX`.
 */
export const DrawScale = createContext<number | undefined>(undefined);

/**
 * Draws one component centred on (0, 0), in millimetres. The caller positions
 * and rotates it. How it looks is worked out by `drawingOf`; this only paints it.
 */
export function Component({ piece, type, assets, highlight }: Readonly<Props>) {
  const [w, h] = sizeOf(type);
  const drawing = drawingOf(
    type,
    { face: piece.face, data: piece.data, value: piece.value },
    assets,
  );
  const scale = useContext(DrawScale);
  const { outline, corner } = drawing;
  // Zones and locked pieces lie flat on the table, so they cast no shadow.
  const flat = drawing.dashed || piece.locked === true;
  const outlineProps = {
    fill: drawing.fill,
    stroke: drawing.stroke,
    strokeWidth: 0.3,
    ...(highlight && HIGHLIGHT[highlight]),
    dash: drawing.dashed ? [3, 2] : undefined,
    shadowColor: 'black',
    shadowOpacity: flat ? 0 : 0.25,
    shadowBlur: scale ? Math.min(SHADOW_BLUR, MAX_SHADOW_BLUR_PX / scale) : SHADOW_BLUR,
    shadowOffset: { x: 0.4, y: 0.6 },
    // Only the fill casts the shadow. With the outline casting one too, Konva draws
    // every piece into a window-sized buffer first, which costs more the more is shown.
    shadowForStrokeEnabled: false,
  };

  return (
    <Group>
      <Outline shape={outline} w={w} h={h} corner={corner} {...outlineProps} />
      <Group
        x={-w / 2}
        y={-h / 2}
        clipFunc={outline === 'rect' ? (ctx) => roundRect(ctx, w, h, corner) : undefined}
      >
        {drawing.layers.map((layer, i) => (
          <LayerView key={i} layer={layer} faceSize={[w, h]} />
        ))}
        {drawing.plainBack && <BackPattern w={w} h={h} />}
        {drawing.valueText !== undefined && (
          <CenteredText text={drawing.valueText} w={w} h={h} size={Math.min(w, h) * 0.55} />
        )}
      </Group>
    </Group>
  );
}

function Outline({
  shape,
  w,
  h,
  corner,
  ...style
}: { shape: string; w: number; h: number; corner: number } & Konva.ShapeConfig) {
  switch (shape) {
    case 'circle':
    case 'disc':
      return <Ellipse radiusX={w / 2} radiusY={h / 2} {...style} />;
    case 'ellipse':
      return <Ellipse radiusX={w / 2} radiusY={h / 2} {...style} />;
    case 'hex':
      return <RegularPolygon sides={6} radius={Math.min(w, h) / 2} {...style} />;
    case 'triangle':
      return <RegularPolygon sides={3} radius={Math.min(w, h) / 2} {...style} />;
    case 'meeple':
      return <Path data={meeplePath(w, h)} x={-w / 2} y={-h / 2} {...style} />;
    default:
      return <Rect x={-w / 2} y={-h / 2} width={w} height={h} cornerRadius={corner} {...style} />;
  }
}

function roundRect(ctx: Konva.Context, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.arcTo(w, 0, w, h, radius);
  ctx.arcTo(w, h, 0, h, radius);
  ctx.arcTo(0, h, 0, 0, radius);
  ctx.arcTo(0, 0, w, 0, radius);
  ctx.closePath();
}

/** A plain back for two-sided components that do not define one. */
function BackPattern({ w, h }: Readonly<{ w: number; h: number }>) {
  const inset = Math.min(w, h) * 0.08;
  return (
    <Rect
      x={inset}
      y={inset}
      width={w - 2 * inset}
      height={h - 2 * inset}
      cornerRadius={inset / 2}
      stroke="#d8dee9"
      strokeWidth={0.4}
      opacity={0.6}
      listening={false}
    />
  );
}

function CenteredText({
  text,
  w,
  h,
  size,
}: Readonly<{ text: string; w: number; h: number; size: number }>) {
  return (
    <Text
      text={text}
      width={w}
      height={h}
      align="center"
      verticalAlign="middle"
      fontSize={size}
      fontStyle="bold"
      fill="#222"
      listening={false}
    />
  );
}

interface Common {
  rotation: number;
  opacity: number;
  listening: boolean;
}

function LayerView({
  layer,
  faceSize,
}: Readonly<{ layer: DrawLayer; faceSize: [number, number] }>) {
  const common = { rotation: layer.rotate, opacity: layer.opacity, listening: false };
  if (layer.kind === 'text') return <TextLayerView layer={layer} common={common} />;
  if (layer.kind === 'image')
    return <ImageLayerView layer={layer} faceSize={faceSize} common={common} />;
  return <ShapeLayerView layer={layer} common={common} />;
}

function TextLayerView({ layer, common }: Readonly<{ layer: DrawText; common: Common }>) {
  const { valign, ...box } = textBox(layer);
  return (
    <Text
      {...common}
      {...box}
      text={layer.text}
      verticalAlign={valign}
      fontSize={(layer.font?.size ?? 10) * PT}
      fontFamily={layer.font?.family ?? 'system-ui, sans-serif'}
      fontStyle={fontStyle(layer.font)}
      fill={layer.color}
    />
  );
}

function ShapeLayerView({ layer, common }: Readonly<{ layer: DrawShape; common: Common }>) {
  const [ax, ay] = layer.at;
  const style = {
    ...common,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
  };
  const [sw, sh] = layerSize(layer.size, [0, 0]);
  const ellipse = (
    <Ellipse x={ax + sw / 2} y={ay + sh / 2} radiusX={sw / 2} radiusY={sh / 2} {...style} />
  );
  switch (layer.shape) {
    case 'circle':
    case 'disc':
      return layer.r === undefined ? ellipse : <Circle x={ax} y={ay} radius={layer.r} {...style} />;
    case 'ellipse':
      return ellipse;
    case 'hex':
    case 'triangle': {
      // With a radius the polygon is centred on its anchor, else it fills its box.
      const centred = layer.r !== undefined;
      return (
        <RegularPolygon
          x={centred ? ax : ax + sw / 2}
          y={centred ? ay : ay + sh / 2}
          sides={layer.shape === 'hex' ? 6 : 3}
          radius={layer.r ?? Math.min(sw, sh) / 2}
          {...style}
        />
      );
    }
    case 'meeple':
      return <Path data={meeplePath(sw, sh)} x={ax} y={ay} {...style} />;
    default:
      return (
        <Rect
          x={ax}
          y={ay}
          width={sw}
          height={sh}
          cornerRadius={layer.shape === 'cube' ? 1 : 0}
          {...style}
        />
      );
  }
}

function ImageLayerView({
  layer,
  faceSize,
  common,
}: Readonly<{ layer: DrawImage; faceSize: [number, number]; common: Common }>) {
  const image = useProjectImage(layer.file);
  if (!image) return null;
  const [x, y] = layer.at;
  const [w, h] = layerSize(layer.size, faceSize);
  const natural: [number, number] = [image.naturalWidth || w, image.naturalHeight || h];
  const box = imageBox(layer.fit, [x, y, w, h], tileRect(natural, layer.tile));
  return <Image {...common} image={image} {...box} />;
}
