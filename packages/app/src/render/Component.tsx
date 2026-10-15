import type { Piece } from '@trayful/core';
import {
  PRIMITIVE_INFO,
  renderTemplate,
  type ComponentType,
  type Face,
  type Layer,
} from '@trayful/formats/browser';
import type Konva from 'konva';
import { Circle, Ellipse, Group, Image, Path, Rect, RegularPolygon, Text } from 'react-konva';
import { isShown, resolveColor, type Data } from './color';
import {
  fillOf,
  fontStyle,
  imageBox,
  layerSize,
  textBox,
  type ImageLayer,
  type TextLayer,
} from './face';
import { sizeOf } from './geometry';
import { useProjectImage } from './images';

/** 1 typographic point in millimetres. */
const PT = 0.3528;
const OUTLINE = '#5c5346';

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
  palette: Record<string, string>;
  selected?: boolean;
}

/**
 * Draws one component centred on (0, 0), in millimetres. The caller positions
 * and rotates it.
 */
export function Component({ piece, type, palette, selected }: Readonly<Props>) {
  const [w, h] = sizeOf(type);
  const data: Data = piece.data ?? {};
  const twoSided = PRIMITIVE_INFO[type.base].sides === 2;
  const showBack = twoSided && piece.face === 'down';
  const face: Face | undefined = showBack ? type.back : type.front;
  const outline = type.shape ?? (type.base === 'meeple' ? 'meeple' : 'rect');
  const corner = type.corner ?? (type.base === 'die' ? 2 : 0);

  const fill = fillOf(type, showBack, (color) => resolveColor(color, data, palette));
  const stroke = selected ? '#2f81f7' : (resolveColor(face?.stroke, data, palette) ?? OUTLINE);
  const strokeWidth = selected ? 1.2 : 0.3;

  const outlineProps = {
    fill,
    stroke,
    strokeWidth,
    dash: type.base === 'zone' ? [3, 2] : undefined,
    shadowColor: 'black',
    shadowOpacity: type.base === 'board' || type.base === 'zone' ? 0 : 0.25,
    shadowBlur: 2,
    shadowOffset: { x: 0.4, y: 0.6 },
  };

  return (
    <Group>
      <Outline shape={outline} w={w} h={h} corner={corner} {...outlineProps} />
      <Group
        x={-w / 2}
        y={-h / 2}
        clipFunc={outline === 'rect' ? (ctx) => roundRect(ctx, w, h, corner) : undefined}
      >
        {face?.layers?.map((layer, i) => (
          <LayerView key={i} layer={layer} data={data} palette={palette} faceSize={[w, h]} />
        ))}
        {!face?.layers && showBack && !type.back && <BackPattern w={w} h={h} />}
        {(type.base === 'die' || type.base === 'counter') && piece.value !== undefined && (
          <CenteredText text={String(piece.value)} w={w} h={h} size={Math.min(w, h) * 0.55} />
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
  data,
  palette,
  faceSize,
}: Readonly<{
  layer: Layer;
  data: Data;
  palette: Record<string, string>;
  faceSize: [number, number];
}>) {
  if (!isShown(layer.when, data)) return null;
  const common = { rotation: layer.rotate ?? 0, opacity: layer.opacity ?? 1, listening: false };
  if ('text' in layer)
    return <TextLayerView layer={layer} data={data} palette={palette} common={common} />;
  if ('image' in layer)
    return <ImageLayerView layer={layer} data={data} faceSize={faceSize} common={common} />;
  return <ShapeLayerView layer={layer} data={data} palette={palette} common={common} />;
}

function TextLayerView({
  layer,
  data,
  palette,
  common,
}: Readonly<{ layer: TextLayer; data: Data; palette: Record<string, string>; common: Common }>) {
  const text = renderTemplate(layer.text, data);
  if (!text) return null;
  const { valign, ...box } = textBox(layer);
  return (
    <Text
      {...common}
      {...box}
      text={text}
      verticalAlign={valign}
      fontSize={(layer.font?.size ?? 10) * PT}
      fontFamily={layer.font?.family ?? 'system-ui, sans-serif'}
      fontStyle={fontStyle(layer.font)}
      fill={resolveColor(layer.color, data, palette) ?? '#111'}
    />
  );
}

function ShapeLayerView({
  layer,
  data,
  palette,
  common,
}: Readonly<{
  layer: Exclude<Layer, TextLayer | ImageLayer>;
  data: Data;
  palette: Record<string, string>;
  common: Common;
}>) {
  const [ax, ay] = layer.at ?? [0, 0];
  const fill = resolveColor(layer.fill, data, palette);
  const stroke = resolveColor(layer.stroke, data, palette);
  const style = { ...common, fill, stroke, strokeWidth: layer.strokeWidth ?? (stroke ? 0.3 : 0) };
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
  data,
  faceSize,
  common,
}: Readonly<{ layer: ImageLayer; data: Data; faceSize: [number, number]; common: Common }>) {
  const path = renderTemplate(layer.image, data).trim();
  const image = useProjectImage(path || undefined);
  if (!image) return null;
  const [x, y] = layer.at ?? [0, 0];
  const [w, h] = layerSize(layer.size, faceSize);
  const natural: [number, number] = [image.naturalWidth || w, image.naturalHeight || h];
  return <Image {...common} image={image} {...imageBox(layer.fit, [x, y, w, h], natural)} />;
}
