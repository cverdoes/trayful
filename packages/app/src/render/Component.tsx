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
import { sizeOf } from './geometry';
import { useProjectImage } from './images';

/** 1 typographic point in millimetres. */
const PT = 0.3528;
const DEFAULT_FILL = '#f4f1ea';
const BACK_FILL = '#3b4252';
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
export function Component({ piece, type, palette, selected }: Props) {
  const [w, h] = sizeOf(type);
  const data: Data = piece.data ?? {};
  const twoSided = PRIMITIVE_INFO[type.base].sides === 2;
  const showBack = twoSided && piece.face === 'down';
  const face: Face | undefined = showBack ? type.back : type.front;
  const outline = type.shape ?? (type.base === 'meeple' ? 'meeple' : 'rect');
  const corner = type.corner ?? (type.base === 'die' ? 2 : 0);

  const fill =
    resolveColor(face?.fill, data, palette) ??
    (showBack ? (type.back ? undefined : BACK_FILL) : resolveColor(type.fill, data, palette)) ??
    (type.base === 'zone' ? 'transparent' : showBack ? BACK_FILL : DEFAULT_FILL);
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
function BackPattern({ w, h }: { w: number; h: number }) {
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

function CenteredText({ text, w, h, size }: { text: string; w: number; h: number; size: number }) {
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

/** Large box used to anchor centred or right-aligned text on a point. */
const ANCHOR_BOX = 400;

function LayerView({
  layer,
  data,
  palette,
  faceSize,
}: {
  layer: Layer;
  data: Data;
  palette: Record<string, string>;
  faceSize: [number, number];
}) {
  if (!isShown(layer.when, data)) return null;
  const [ax, ay] = layer.at ?? [0, 0];
  const common = { rotation: layer.rotate ?? 0, opacity: layer.opacity ?? 1, listening: false };

  if ('text' in layer) {
    const text = renderTemplate(layer.text, data);
    if (!text) return null;
    const align = layer.align ?? 'left';
    const valign = layer.valign ?? 'top';
    const width = layer.width ?? ANCHOR_BOX;
    const x =
      layer.width !== undefined || align === 'left'
        ? ax
        : align === 'center'
          ? ax - width / 2
          : ax - width;
    const height = valign === 'top' ? undefined : ANCHOR_BOX;
    const y = valign === 'top' ? ay : valign === 'middle' ? ay - ANCHOR_BOX / 2 : ay - ANCHOR_BOX;
    const style = [
      layer.font?.weight === 'bold' ? 'bold' : '',
      layer.font?.style === 'italic' ? 'italic' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Text
        {...common}
        text={text}
        x={x}
        y={y}
        width={width}
        height={height}
        align={align}
        verticalAlign={valign}
        wrap={layer.width !== undefined ? 'word' : 'none'}
        fontSize={(layer.font?.size ?? 10) * PT}
        fontFamily={layer.font?.family ?? 'system-ui, sans-serif'}
        fontStyle={style || 'normal'}
        fill={resolveColor(layer.color, data, palette) ?? '#111'}
      />
    );
  }

  if ('image' in layer) {
    return <ImageLayerView layer={layer} data={data} faceSize={faceSize} common={common} />;
  }

  const fill = resolveColor(layer.fill, data, palette);
  const stroke = resolveColor(layer.stroke, data, palette);
  const style = { ...common, fill, stroke, strokeWidth: layer.strokeWidth ?? (stroke ? 0.3 : 0) };
  const [sw, sh] =
    layer.size !== undefined
      ? typeof layer.size === 'number'
        ? [layer.size, layer.size]
        : layer.size
      : [0, 0];
  switch (layer.shape) {
    case 'circle':
    case 'disc':
      return layer.r !== undefined ? (
        <Circle x={ax} y={ay} radius={layer.r} {...style} />
      ) : (
        <Ellipse x={ax + sw / 2} y={ay + sh / 2} radiusX={sw / 2} radiusY={sh / 2} {...style} />
      );
    case 'ellipse':
      return (
        <Ellipse x={ax + sw / 2} y={ay + sh / 2} radiusX={sw / 2} radiusY={sh / 2} {...style} />
      );
    case 'hex':
    case 'triangle':
      return (
        <RegularPolygon
          x={layer.r !== undefined ? ax : ax + sw / 2}
          y={layer.r !== undefined ? ay : ay + sh / 2}
          sides={layer.shape === 'hex' ? 6 : 3}
          radius={layer.r ?? Math.min(sw, sh) / 2}
          {...style}
        />
      );
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
}: {
  layer: Extract<Layer, { image: string }>;
  data: Data;
  faceSize: [number, number];
  common: { rotation: number; opacity: number; listening: boolean };
}) {
  const path = renderTemplate(layer.image, data).trim();
  const image = useProjectImage(path || undefined);
  if (!image) return null;
  const [x, y] = layer.at ?? [0, 0];
  const [w, h] =
    layer.size !== undefined
      ? typeof layer.size === 'number'
        ? [layer.size, layer.size]
        : layer.size
      : faceSize;
  const fit = layer.fit ?? 'cover';
  const iw = image.naturalWidth || w;
  const ih = image.naturalHeight || h;
  if (fit === 'stretch')
    return <Image {...common} image={image} x={x} y={y} width={w} height={h} />;
  if (fit === 'contain') {
    const scale = Math.min(w / iw, h / ih);
    return (
      <Image
        {...common}
        image={image}
        x={x + (w - iw * scale) / 2}
        y={y + (h - ih * scale) / 2}
        width={iw * scale}
        height={ih * scale}
      />
    );
  }
  // cover: crop the image to the box's aspect ratio.
  const scale = Math.max(w / iw, h / ih);
  const cw = w / scale;
  const ch = h / scale;
  return (
    <Image
      {...common}
      image={image}
      x={x}
      y={y}
      width={w}
      height={h}
      crop={{ x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch }}
    />
  );
}
