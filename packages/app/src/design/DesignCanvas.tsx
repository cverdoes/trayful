import { NO_ASSETS, type ComponentType } from '@trayful/formats/browser';
import type Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Group, Layer, Line, Stage } from 'react-konva';
import { useShallow } from 'zustand/react/shallow';
import { Component } from '../render/Component';
import { sizeOf } from '../render/geometry';
import { previewPiece } from '../render/Preview';
import { useStore } from '../store';
import { Guides, LayerHandles, SnapTargets } from './CanvasOverlays';
import { twoSided, type Side } from './edit';
import { press, type Gesture } from './gestures';
import { fitScale } from './layout';
import { GRID, type Guide, type Point } from './manipulate';
import { sampleData } from './samples';
import { readImage } from './files';
import { addImage } from './projectEdits';
import { editDraft, useDesign } from './store';

/** Space between the front and the back, in millimetres. */
const GAP = 12;
/** Pixels within which the pointer is on a handle, and things snap. */
const REACH_PX = 7;

/** The type at real proportions: each side, its grid, its drop areas and the selection. */
export function DesignCanvas() {
  const shown = useLastValidDraft();
  const [box, size] = useSize<HTMLDivElement>();
  const drop = (e: React.DragEvent<HTMLDivElement>) => {
    // Without this the browser would open the dropped file in place of the designer.
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!shown || !file) return;
    if (!file.type.startsWith('image/')) {
      useDesign.setState({ message: `"${file.name}" is not a picture; drop a PNG, JPEG or SVG.` });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const { side } = layoutOf(shown, size).toFace([e.clientX - rect.left, e.clientY - rect.top]);
    readImage(file).then(
      (image) => addImage(image, side),
      () => useDesign.setState({ message: `"${file.name}" could not be read as a picture.` }),
    );
  };
  useFaceToScreen(box, shown, size);
  return (
    <div
      ref={box}
      className="design-canvas"
      data-testid="design-canvas"
      onDragOver={(e) => e.preventDefault()}
      onDrop={drop}
    >
      {shown && <Faces type={shown} size={size} />}
    </div>
  );
}

/** Lets end-to-end tests find a point of a face on the page. */
function useFaceToScreen(
  box: React.RefObject<HTMLDivElement | null>,
  type: ComponentType | undefined,
  size: [number, number],
) {
  useEffect(() => {
    if (!window.__trayful || !type) return;
    const { scale, left, top, face } = layoutOf(type, size);
    window.__trayful.faceToScreen = (side, x, y) => {
      const rect = box.current!.getBoundingClientRect();
      const offset = side === 'back' ? face[0] + GAP : 0;
      return { x: rect.left + left + (x + offset) * scale, y: rect.top + top + y * scale };
    };
  }, [box, type, size]);
}

/** Where the faces sit in the stage: each side's left edge, the top, and pixels per millimetre. */
function layoutOf(type: ComponentType, size: [number, number]) {
  const [w, h] = sizeOf(type);
  const sides: Side[] = twoSided(type) ? ['front', 'back'] : ['front'];
  const width = sides.length * w + (sides.length - 1) * GAP;
  const scale = fitScale([width, h], size);
  const left = (size[0] - width * scale) / 2;
  const top = (size[1] - h * scale) / 2;
  /** The side under a stage pixel, and the point on it in millimetres. */
  const toFace = ([x, y]: Point): { side: Side; point: Point } => {
    const mm = (x - left) / scale;
    const index = Math.min(sides.length - 1, Math.max(0, Math.floor(mm / (w + GAP / 2))));
    return { side: sides[index]!, point: [mm - index * (w + GAP), (y - top) / scale] };
  };
  return { sides, scale, left, top, face: [w, h] as Point, toFace };
}

function Faces({ type, size }: Readonly<{ type: ComponentType; size: [number, number] }>) {
  const assets = useStore((s) => s.view?.assets ?? NO_ASSETS);
  const selection = useDesign(
    useShallow((s) => ({ side: s.side, layer: s.layer, target: s.target })),
  );
  const layout = layoutOf(type, size);
  const { sides, scale, left, top, face } = layout;
  const tolerance = REACH_PX / scale;
  const [preview, setPreview] = useState<{ type: ComponentType; guides: Guide[] }>();
  const drag = useDrag(setPreview);
  const shown = preview?.type ?? type;
  const data = useSampleData(shown);

  const down = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const pixel = e.target.getStage()?.getPointerPosition();
    if (!pixel) return;
    const { side, point } = layout.toFace([pixel.x, pixel.y]);
    const result = press({ type, side, point, tolerance }, selection);
    useDesign.setState({ layer: undefined, target: undefined, ...result.selection });
    // The canvas shows the last valid version; dragging it would undo later edits.
    if (useDesign.getState().problems.length) return;
    if (result.gesture) drag.start(result.gesture, (p) => layout.toFace(p).point, result.changed);
  };

  return (
    <Stage
      width={size[0]}
      height={size[1]}
      onPointerDown={down}
      onPointerMove={(e) => drag.move(e.target.getStage()?.getPointerPosition())}
    >
      <Layer>
        {sides.map((s, i) => (
          <Group
            key={s}
            x={left + i * (face[0] + GAP) * scale}
            y={top}
            scaleX={scale}
            scaleY={scale}
          >
            <Group x={face[0] / 2} y={face[1] / 2} listening={false}>
              <Component
                piece={previewPiece(shown, data, s === 'front' ? 'up' : 'down')}
                type={shown}
                assets={assets}
              />
            </Group>
            <FaceGrid w={face[0]} h={face[1]} />
            {s === 'front' && (
              <SnapTargets type={shown} selected={selection.target} scale={scale} />
            )}
            {s === selection.side && selection.layer !== undefined && (
              <LayerHandles
                type={shown}
                side={s}
                index={selection.layer}
                scale={scale}
                tolerance={tolerance}
              />
            )}
            {preview && s === selection.side && (
              <Guides guides={preview.guides} face={face} scale={scale} />
            )}
          </Group>
        ))}
      </Layer>
    </Stage>
  );
}

/**
 * A drag on the canvas: shows the type as the gesture makes it while the pointer
 * moves, and makes it one change to the draft (one step to undo) when released.
 */
function useDrag(show: (preview: { type: ComponentType; guides: Guide[] } | undefined) => void) {
  const current = useRef<{ gesture: Gesture; toFace: (pixel: Point) => Point }>(undefined);
  const last = useRef<ComponentType>(undefined);
  useEffect(() => {
    const end = () => {
      const result = last.current;
      current.current = undefined;
      last.current = undefined;
      show(undefined);
      if (result) editDraft(() => result);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [show]);
  return {
    start(gesture: Gesture, toFace: (pixel: Point) => Point, changed?: ComponentType) {
      current.current = { gesture, toFace };
      last.current = changed;
      if (changed) show({ type: changed, guides: [] });
    },
    move(pixel: { x: number; y: number } | null | undefined) {
      const drag = current.current;
      if (!drag || !pixel) return;
      const result = drag.gesture(drag.toFace([pixel.x, pixel.y]));
      last.current = result.type;
      show(result);
    },
  };
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
