import type { MarkBox, Piece } from '@trayful/core';
import { useState } from 'react';
import { Group, Rect } from 'react-konva';
import { setCursor } from './cursor';
import { clickBox, eraseBox } from './marks';
import { localBoxes } from './render/Marks';
import type { Types } from './render/geometry';
import { useStore } from './store';

/**
 * The stamp and text boxes of a piece on the table, drawn in the piece's own
 * coordinates. A box lights up under the pointer, as a circle (a wide box as a
 * pill); a click stamps it or asks what to put there, and a right-click erases it.
 */
export function MarkTargets({ piece, types }: Readonly<{ piece: Piece; types: Types }>) {
  const [hovered, setHovered] = useState<string>();
  const scale = useStore((s) => s.viewport.scale);
  return (
    <>
      {localBoxes(piece, types).map((box) => {
        const lit = hovered === box.key;
        const [w, h] = box.size;
        return (
          <Group key={box.key} x={box.spot.pos[0]} y={box.spot.pos[1]}>
            <Rect
              x={-w / 2}
              y={-h / 2}
              width={w}
              height={h}
              cornerRadius={Math.min(w, h) / 2}
              fill={lit ? 'rgba(47,129,247,0.2)' : 'transparent'}
              stroke={lit ? '#2f81f7' : undefined}
              strokeWidth={1.5 / scale}
              onMouseEnter={(e) => {
                setHovered(box.key);
                setCursor(e, 'pointer');
              }}
              onMouseLeave={(e) => {
                setHovered((key) => (key === box.key ? undefined : key));
                setCursor(e, '');
              }}
              onClick={(e) => {
                e.cancelBubble = true;
                if (e.evt.button === 0) click(box, e.evt);
              }}
              onTap={(e) => {
                e.cancelBubble = true;
                click(box, e.evt as unknown as MouseEvent);
              }}
              onContextMenu={(e) => {
                e.cancelBubble = true;
                e.evt.preventDefault();
                const erase = eraseBox(box);
                if (erase) useStore.getState().command(erase);
              }}
            />
          </Group>
        );
      })}
    </>
  );
}

function click(box: MarkBox, evt: MouseEvent) {
  const action = clickBox(box, { x: evt.clientX, y: evt.clientY });
  if (!action) return;
  if ('command' in action) useStore.getState().command(action.command);
  else useStore.setState({ markPick: action.pick });
}
