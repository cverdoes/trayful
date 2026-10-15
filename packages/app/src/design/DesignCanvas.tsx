import type { ComponentType } from '@trayful/formats/browser';
import type Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Group, Layer, Line, Rect, Stage } from 'react-konva';
import { Component } from '../render/Component';
import { sizeOf } from '../render/geometry';
import { previewPiece } from '../render/Preview';
import { useStore } from '../store';
import { layersOf, twoSided, type Side } from './edit';
import { sampleData } from './samples';
import { fitScale, layerAt, layerBounds } from './layout';
import { useDesign } from './store';

/** Space between the front and the back, in millimetres. */
const GAP = 12;
/** Grid spacing on the faces, in millimetres. */
const GRID = 5;

/** The type at real proportions: each side, its grid, and the selected layer outlined. */
export function DesignCanvas() {
  const shown = useLastValidDraft();
  const [box, size] = useSize<HTMLDivElement>();
  return (
    <div ref={box} className="design-canvas" data-testid="design-canvas">
      {shown && <Faces type={shown} size={size} />}
    </div>
  );
}

function Faces({ type, size }: Readonly<{ type: ComponentType; size: [number, number] }>) {
  const palette = useStore((s) => s.view?.palette ?? {});
  const side = useDesign((s) => s.side);
  const layer = useDesign((s) => s.layer);
  const data = useSampleData(type);
  const [w, h] = sizeOf(type);
  const sides: Side[] = twoSided(type) ? ['front', 'back'] : ['front'];
  const width = sides.length * w + (sides.length - 1) * GAP;
  const scale = fitScale([width, h], size);
  const left = (size[0] - width * scale) / 2;
  const top = (size[1] - h * scale) / 2;

  const pick = (s: Side) => (e: Konva.KonvaEventObject<MouseEvent>) => {
    const point = e.target.getStage()?.getPointerPosition();
    if (!point) return;
    const x = (point.x - left) / scale - sides.indexOf(s) * (w + GAP);
    const y = (point.y - top) / scale;
    useDesign.setState({ side: s, layer: layerAt(layersOf(type, s), [x, y], [w, h]) });
  };

  return (
    <Stage width={size[0]} height={size[1]}>
      <Layer>
        {sides.map((s, i) => (
          <Group
            key={s}
            x={left + i * (w + GAP) * scale}
            y={top}
            scaleX={scale}
            scaleY={scale}
            onClick={pick(s)}
          >
            <Group x={w / 2} y={h / 2}>
              <Component
                piece={previewPiece(type, data, s === 'front' ? 'up' : 'down')}
                type={type}
                palette={palette}
              />
            </Group>
            <FaceGrid w={w} h={h} />
            {s === side && layer !== undefined && <Selection type={type} side={s} index={layer} />}
          </Group>
        ))}
      </Layer>
    </Stage>
  );
}

/** Faint lines every 5 mm, to place things by eye. */
function FaceGrid({ w, h }: Readonly<{ w: number; h: number }>) {
  const lines: number[][] = [];
  for (let x = GRID; x < w; x += GRID) lines.push([x, 0, x, h]);
  for (let y = GRID; y < h; y += GRID) lines.push([0, y, w, y]);
  return (
    <Group listening={false} opacity={0.18}>
      {lines.map((points) => (
        <Line key={points.join()} points={points} stroke="#000" strokeWidth={0.15} />
      ))}
    </Group>
  );
}

function Selection({
  type,
  side,
  index,
}: Readonly<{ type: ComponentType; side: Side; index: number }>) {
  const layer = layersOf(type, side)[index];
  if (!layer) return null;
  const b = layerBounds(layer, sizeOf(type));
  return (
    <Rect
      x={b.x}
      y={b.y}
      width={b.w}
      height={b.h}
      stroke="#2f81f7"
      strokeWidth={0.5}
      dash={[1.5, 1]}
      listening={false}
    />
  );
}

/**
 * The type as last drawn without problems. While a change makes the type invalid
 * (a size being typed, say), the canvas keeps showing the last version that works.
 */
function useLastValidDraft(): ComponentType | undefined {
  const draft = useDesign((s) => s.draft);
  const valid = useDesign((s) => s.problems.length === 0);
  const last = useRef<ComponentType | undefined>(undefined);
  if (valid || last.current?.id !== draft?.id) last.current = draft;
  return last.current;
}

/** Field values to fill the faces with: the chosen design's, or stand-ins. */
function useSampleData(type: ComponentType) {
  const sample = useDesign((s) => s.components.find((c) => c.id === s.sample));
  return sample?.type === type.id ? sample.data : sampleData(type);
}

/** An element's size in pixels, kept up to date as the window changes. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize([Math.max(1, width), Math.max(1, height)]);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
