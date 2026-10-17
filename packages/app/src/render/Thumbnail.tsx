import type { Piece } from '@trayful/core';
import { Group, Layer, Stage } from 'react-konva';
import { useStore } from '../store';
import { Component } from './Component';
import { sizeOf } from './geometry';

/** A piece drawn small on a canvas of its own, its longer side `length` pixels, unturned. */
export function Thumbnail({
  piece,
  length,
  face = piece.face,
}: Readonly<{ piece: Piece; length: number; face?: Piece['face'] }>) {
  const view = useStore((s) => s.view)!;
  const type = view.types[piece.type];
  if (!type) return null;
  const [w, h] = sizeOf(type);
  const scale = length / Math.max(h, w);
  const shown: Piece = { ...piece, pos: [0, 0], rot: 0, face };
  return (
    <Stage width={w * scale + 4} height={h * scale + 4} listening={false}>
      <Layer>
        <Group x={2 + (w * scale) / 2} y={2 + (h * scale) / 2} scaleX={scale} scaleY={scale}>
          <Component piece={shown} type={type} assets={view.assets} />
        </Group>
      </Layer>
    </Stage>
  );
}
