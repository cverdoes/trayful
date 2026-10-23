import { stackOffsets, type TableObject, type TableState } from '@trayful/core';
import type { Assets } from '@trayful/formats/browser';
import { useEffect } from 'react';
import { Group, Layer, Stage } from 'react-konva';
import { closeMagnifier, magnifiedScene } from './magnify';
import { Component } from './render/Component';
import { facePiece, sizeOf, type Types } from './render/geometry';
import { useStore } from './store';

/** How much of the window the magnified piece may fill. */
const FILL = 0.85;

/**
 * The piece Space was pressed over, with whatever lies on it, drawn as large as the
 * window allows in front of the dimmed table, so its text is easy to read. A click
 * anywhere closes it.
 */
export function Magnifier() {
  const magnifier = useStore((s) => s.magnifier);
  useCloseOnClick(magnifier !== undefined);
  const table = useStore((s) => s.table);
  const view = useStore((s) => s.view);
  const scene = magnifier && table && view && magnifiedScene(table, view.types, magnifier.piece);
  const type = scene && view.types[scene.piece.type];
  if (!scene || !type) return null;
  const { x0, y0, x1, y1 } = scene.bounds;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = Math.min((width * FILL) / (x1 - x0), (height * FILL) / (y1 - y0));
  return (
    <div className="magnifier" role="img" aria-label="Magnified piece">
      <Stage width={width} height={height} listening={false}>
        <Layer>
          <Group
            x={width / 2 - ((x0 + x1) / 2) * scale}
            y={height / 2 - ((y0 + y1) / 2) * scale}
            scaleX={scale}
            scaleY={scale}
          >
            <Component piece={scene.piece} type={type} assets={view.assets} />
            {scene.riders.map((rider) => (
              <Rider
                key={rider.id}
                object={rider}
                table={table}
                types={view.types}
                assets={view.assets}
              />
            ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

/** A piece or stack lying on the magnified piece: a pile shows its top card, a fan every card. */
function Rider({
  object,
  table,
  types,
  assets,
}: Readonly<{ object: TableObject; table: TableState; types: Types; assets: Assets }>) {
  const top = facePiece(table, object);
  const topType = top && types[top.type];
  if (!top || !topType) return null;
  const shown = object.kind === 'stack' && object.layout ? object.items : [top.id];
  const offsets = stackOffsets(
    object.kind === 'stack' ? object.layout : undefined,
    shown.length,
    sizeOf(topType),
  );
  return (
    <Group x={object.pos[0]} y={object.pos[1]} rotation={object.rot}>
      {shown.map((id, i) => {
        const piece = table.objects[id];
        const type = piece?.kind === 'piece' ? types[piece.type] : undefined;
        if (piece?.kind !== 'piece' || !type) return null;
        return (
          <Group key={id} x={offsets[i]![0]} y={offsets[i]![1]}>
            <Component piece={piece} type={type} assets={assets} />
          </Group>
        );
      })}
    </Group>
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
