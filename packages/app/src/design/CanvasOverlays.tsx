// What the designer draws over the faces: the selected layer's box and handles,
// the snap targets with their numbered spots, and the guides a drag snapped to.
// Sizes are in millimetres, divided by the scale where they should stay a fixed
// number of pixels on screen.
import type { ComponentType, SnapTarget } from '@trayful/formats/browser';
import { Circle, Group, Line, Rect, Text } from 'react-konva';
import { sizeOf } from '../render/geometry';
import { layersOf, type Side } from './edit';
import { rotateHandle } from './gestures';
import { layerBounds } from './layout';
import { handlesOf, pivotOf, type Guide } from './manipulate';
import { areaBox, spotsOf, targetHandles } from './snaps';

const SELECT = '#2f81f7';
const SPOT = '#d9480f';

/** Pixels a handle spans on screen, at any zoom. */
const HANDLE_PX = 5;

export function LayerHandles({
  type,
  side,
  index,
  scale,
  tolerance,
}: Readonly<{ type: ComponentType; side: Side; index: number; scale: number; tolerance: number }>) {
  const layer = layersOf(type, side)[index];
  if (!layer) return null;
  const face = sizeOf(type);
  const box = layerBounds(layer, face);
  const [px, py] = pivotOf(layer, face);
  const handle = HANDLE_PX / scale;
  const [rx, ry] = rotateHandle(box, tolerance);
  return (
    // Drawn turned with the layer, around the same point the renderer turns it.
    <Group x={px} y={py} offsetX={px} offsetY={py} rotation={layer.rotate ?? 0} listening={false}>
      <Rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        stroke={SELECT}
        strokeWidth={1 / scale}
        dash={[4 / scale, 3 / scale]}
      />
      <Line points={[box.x + box.w / 2, box.y, rx, ry]} stroke={SELECT} strokeWidth={1 / scale} />
      <Circle x={rx} y={ry} radius={handle} fill="#fff" stroke={SELECT} strokeWidth={1 / scale} />
      {handlesOf(layer, box).map(([name, [x, y]]) => (
        <Rect
          key={name}
          x={x - handle}
          y={y - handle}
          width={2 * handle}
          height={2 * handle}
          fill="#fff"
          stroke={SELECT}
          strokeWidth={1 / scale}
        />
      ))}
    </Group>
  );
}

/** Every snap target of the type: its spots numbered from 0, or its area; the selected one with handles. */
export function SnapTargets({
  type,
  selected,
  scale,
}: Readonly<{ type: ComponentType; selected?: number; scale: number }>) {
  return (
    <Group listening={false}>
      {(type.snap ?? []).map((target, i) => (
        <TargetView key={target.id} target={target} chosen={i === selected} scale={scale} />
      ))}
    </Group>
  );
}

function TargetView({
  target,
  chosen,
  scale,
}: Readonly<{ target: SnapTarget; chosen: boolean; scale: number }>) {
  const color = chosen ? SELECT : SPOT;
  const dot = (chosen ? 5 : 4) / scale;
  const area = areaBox(target);
  return (
    <Group opacity={chosen ? 1 : 0.7}>
      {area && (
        <Rect
          x={area[0]}
          y={area[1]}
          width={area[2]}
          height={area[3]}
          stroke={color}
          strokeWidth={1.5 / scale}
          dash={[6 / scale, 4 / scale]}
        />
      )}
      {spotsOf(target).map(([x, y], i) => (
        <Group key={`${x},${y},${i}`} x={x} y={y}>
          <Circle radius={dot} fill={color} />
          <Text text={String(i)} x={dot * 1.2} y={-dot * 3} fontSize={11 / scale} fill={color} />
        </Group>
      ))}
      <Text
        text={target.id}
        x={(spotsOf(target)[0] ?? area ?? [0, 0])[0]}
        y={(spotsOf(target)[0] ?? area ?? [0, 0])[1] + 8 / scale}
        fontSize={11 / scale}
        fontStyle="bold"
        fill={color}
      />
      {chosen &&
        targetHandles(target).map(([handle, [x, y]]) => (
          <Rect
            key={JSON.stringify(handle)}
            x={x - HANDLE_PX / scale}
            y={y - HANDLE_PX / scale}
            width={(2 * HANDLE_PX) / scale}
            height={(2 * HANDLE_PX) / scale}
            fill="#fff"
            stroke={SELECT}
            strokeWidth={1 / scale}
          />
        ))}
    </Group>
  );
}

/** The lines a drag snapped to, across the whole face. */
export function Guides({
  guides,
  face,
  scale,
}: Readonly<{ guides: Guide[]; face: [number, number]; scale: number }>) {
  return (
    <Group listening={false}>
      {guides.map((g) => (
        <Line
          key={`${g.axis}${g.at}`}
          points={g.axis === 'x' ? [g.at, 0, g.at, face[1]] : [0, g.at, face[0], g.at]}
          stroke="#e8590c"
          strokeWidth={1 / scale}
        />
      ))}
    </Group>
  );
}
