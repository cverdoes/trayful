import type { TableObject } from '@trayful/core';
import type Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import { TableDrag } from './drag';
import { doubleClickCommand, handDropCommands, inBox, type Vec } from './drops';
import { pickFor } from './groups';
import { HAND_DRAG, overHandTray } from './hand';
import { useHover } from './hover';
import { DrawScale, type Highlight } from './render/Component';
import { topLevel } from './render/geometry';
import { setSnapshotStage } from './snapshot';
import { useStore } from './store';
import { BagBadges, PieceView, SnapHints, StackView } from './TableObjects';
import { fitToTable, toWorld, zoomAt } from './viewport';

/** The table: every object on it, which can be dragged, clicked and selected. */
export function Table() {
  const view = useStore((s) => s.view);
  const table = useStore((s) => s.table);
  const redrawKey = useStore((s) => s.redrawKey);
  const shiftDown = useStore((s) => s.shiftDown);
  const viewport = useStore((s) => s.viewport);
  const size = useWindowSize();
  const drag = useRef(new TableDrag()).current;
  const marquee = useMarquee();
  const pointer = useHover(drag.nodes);
  useFitOnce();

  if (!view || !table) return <div className="loading">Loading table…</div>;
  return (
    <div
      className="table"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(HAND_DRAG)) e.preventDefault();
      }}
      onDrop={dropFromHand}
    >
      <Stage
        ref={setSnapshotStage}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={!shiftDown && !marquee.box}
        onDragEnd={(e) => {
          if (e.target.nodeType === 'Stage') {
            useStore.setState((s) => ({
              viewport: { ...s.viewport, x: e.target.x(), y: e.target.y() },
            }));
          }
        }}
        onMouseDown={marquee.onMouseDown}
        onMouseMove={(e) => {
          pointer.onMouseMove(e);
          marquee.onMouseMove(e);
        }}
        onMouseLeave={pointer.onMouseLeave}
        onMouseUp={() => marquee.onMouseUp(topLevel(table))}
        onWheel={onWheel}
      >
        <Layer key={redrawKey}>
          <DrawScale.Provider value={viewport.scale}>
            <Objects drag={drag} />
          </DrawScale.Provider>
          <BagBadges types={view.types} />
          <SnapHints />
          {marquee.box && (
            <Rect
              x={Math.min(marquee.box.from[0], marquee.box.to[0])}
              y={Math.min(marquee.box.from[1], marquee.box.to[1])}
              width={Math.abs(marquee.box.to[0] - marquee.box.from[0])}
              height={Math.abs(marquee.box.to[1] - marquee.box.from[1])}
              fill="rgba(47,129,247,0.12)"
              stroke="#2f81f7"
              strokeWidth={1 / viewport.scale}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}

/** The objects lying on the table, bottom to top. */
function Objects({ drag }: Readonly<{ drag: TableDrag }>) {
  const view = useStore((s) => s.view)!;
  const table = useStore((s) => s.table)!;
  const selection = useStore((s) => s.selection);
  const hovered = useStore((s) => s.hovered);
  const shiftDown = useStore((s) => s.shiftDown);
  const selected = new Set(selection);
  const types = view.types;
  return topLevel(table).map((object) => {
    const common = {
      types,
      assets: view.assets,
      highlight: highlightOf(object.id, selected, hovered),
      register: (node: Konva.Group | null) => {
        if (node) drag.nodes.set(object.id, node);
        else drag.nodes.delete(object.id);
      },
      onClick: (evt: MouseEvent) => click(object, evt),
      onDoubleClick: () => doubleClick(object),
      onDragStart: () => drag.start(object.id),
      onDragMove: (node: Konva.Group) => drag.move(object.id, node),
      onDragEnd: (node: Konva.Group) => drag.end(object.id, node),
    };
    return object.kind === 'stack' ? (
      <StackView
        key={object.id}
        stack={object}
        table={table}
        wholeStack={shiftDown || (selected.has(object.id) && selection.length > 1)}
        onDrawStart={() => drag.drawStart(object)}
        onDrawMove={(node) => drag.drawMove(object, node)}
        onDrawEnd={(pieceId, node, home) => drag.drawEnd(object, pieceId, node, home)}
        {...common}
      />
    ) : (
      <PieceView key={object.id} piece={object} {...common} />
    );
  });
}

/** A selected object shows as selected even under the pointer. */
function highlightOf(
  id: string,
  selected: Set<string>,
  hovered: string | undefined,
): Highlight | undefined {
  if (selected.has(id)) return 'selected';
  return id === hovered ? 'hovered' : undefined;
}

/** Selects what was clicked; a plain click on a piece in a crowded group also lists the group. */
function click(object: TableObject, evt: MouseEvent) {
  const { table, view, select } = useStore.getState();
  const adding = evt.shiftKey || evt.metaKey || evt.ctrlKey;
  select([object.id], adding ? 'toggle' : 'replace');
  if (adding || !table || !view) return;
  const at = { x: evt.clientX, y: evt.clientY };
  useStore.setState({ groupPick: pickFor(table, view.types, object.id, at) });
}

function doubleClick(object: TableObject) {
  const { table, view, command } = useStore.getState();
  const action = table && view && doubleClickCommand(table, view.types, object);
  if (action) command(action);
}

/** Shift-dragging on the empty table selects everything in a box; a click there clears the selection. */
function useMarquee() {
  const [box, setBox] = useState<{ from: Vec; to: Vec } | undefined>();
  const pointer = (stage: Konva.Stage) =>
    toWorld(useStore.getState().viewport, stage.getPointerPosition() ?? { x: 0, y: 0 });
  return {
    box,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage || e.target !== stage) return;
      if (!e.evt.shiftKey) return useStore.getState().select([]);
      const p = pointer(stage);
      setBox({ from: p, to: p });
    },
    onMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (box && stage) setBox({ from: box.from, to: pointer(stage) });
    },
    onMouseUp: (objects: TableObject[]) => {
      if (!box) return;
      useStore.getState().select(inBox(objects, box.from, box.to), 'add');
      setBox(undefined);
    },
  };
}

/** Fits the table to the window once, when it first arrives. */
function useFitOnce() {
  const view = useStore((s) => s.view);
  const table = useStore((s) => s.table);
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && view && table) {
      fitted.current = true;
      fitToTable(table, view.types, window.innerWidth, window.innerHeight);
    }
  }, [view, table]);
}

/** A card dragged out of the hand tray: play it onto a pile, a spot or the table. */
function dropFromHand(e: React.DragEvent<HTMLDivElement>) {
  const id = e.dataTransfer.getData(HAND_DRAG);
  const { table, view, viewport, command } = useStore.getState();
  if (!id || !table || !view || table.objects[id]?.kind !== 'piece') return;
  e.preventDefault();
  if (overHandTray(e.clientX, e.clientY)) return;
  const box = e.currentTarget.getBoundingClientRect();
  const point = toWorld(viewport, { x: e.clientX - box.left, y: e.clientY - box.top });
  for (const c of handDropCommands(table, view.types, { id, point, faceDown: e.altKey }))
    command(c);
}

function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
  e.evt.preventDefault();
  const pointer = e.target.getStage()?.getPointerPosition();
  if (pointer) zoomAt(pointer, Math.exp(-e.evt.deltaY * 0.0015));
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}
