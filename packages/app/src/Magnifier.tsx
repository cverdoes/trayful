import { useEffect } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { closeMagnifier, magnifiedPiece } from './magnify';
import { Component } from './render/Component';
import { sizeOf } from './render/geometry';
import { useStore } from './store';

/** How much of the window the magnified piece may fill. */
const FILL = 0.85;

/**
 * The piece Space was pressed over, drawn as large as the window allows in front of
 * the dimmed table, so its text is easy to read. A click anywhere closes it.
 */
export function Magnifier() {
  const magnifier = useStore((s) => s.magnifier);
  useCloseOnClick(magnifier !== undefined);
  const table = useStore((s) => s.table);
  const view = useStore((s) => s.view);
  const piece = magnifier && table && magnifiedPiece(table, magnifier.piece);
  const type = piece && view?.types[piece.type];
  if (!piece || !type) return null;
  const [w, h] = sizeOf(type);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min((width * FILL) / w, (height * FILL) / h);
  return (
    <div className="magnifier" role="img" aria-label="Magnified piece">
      <Stage width={width} height={height} listening={false}>
        <Layer>
          <Group x={width / 2} y={height / 2} scaleX={scale} scaleY={scale}>
            <Component piece={piece} type={type} assets={view.assets} />
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

/**
 * Closes the magnifier on a click, and keeps the click from reaching the table.
 * The magnifier lets the pointer through to the table, so the piece under it
 * stays hovered and can be magnified again without moving the mouse.
 */
function useCloseOnClick(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      closeMagnifier();
    };
    window.addEventListener('mousedown', onMouseDown, { capture: true });
    return () => window.removeEventListener('mousedown', onMouseDown, { capture: true });
  }, [open]);
}
