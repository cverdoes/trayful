import { surfacesOf, type TableObject } from '@trayful/core';
import type Konva from 'konva';
import { useEffect, useRef, useState } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import { TableDrag } from './drag';
import { doubleClickCommand, handDropCommands, inBox, type Vec } from './drops';
import { pickFor } from './groups';
import { HAND_DRAG, overHandTray } from './hand';
import { useHover } from './hover';
import { clickForPrompt, promptMarks } from './promptTargets';
import { PromptPlaces } from './PromptPlaces';
import { DrawScale, type Highlight } from '../render/Component';
import { topLevel } from '../render/geometry';
import { setSnapshotStage } from '../snapshot';
import { shownNow, useStore } from '../store';
import { ChipRow } from './ChipRow';
import { hasSurfaces, surfaceColor, tilesFor, type Tile } from './surfaces';
import { BagBadges, PieceView, SnapHints, StackView } from './TableObjects';
import { toggleFocus } from './tiles';
import { fitTile, toWorld, viewportOf, zoomAt } from './viewport';

/**
 * The table: one tile for each surface shown, every object on it, which can be
 * dragged, clicked and selected. A table without surfaces is one tile filling the page.
 */
export function Table() {
  const view = useStore((s) => s.view);
  const table = useStore((s) => s.table);
  const drag = useRef(new TableDrag()).current;
  const tiles = useTiles();
  useFitOnLayout(tiles);

  if (!view || !table) return <div className="loading">Loading table…</div>;
  const tiled = hasSurfaces(table);
  return (
    <div className={tiled ? 'table tiled' : 'table'}>
      {tiled && <ChipRow />}
      {tiles.map((tile) => (
        <SurfaceTile key={tile.surface} tile={tile} drag={drag} framed={tiled} />
      ))}
    </div>
  );
}

/** One surface's tile: a canvas with its own pan and zoom, and its name when framed. */
function SurfaceTile({
  tile,
  drag,
  framed,
}: Readonly<{ tile: Tile; drag: TableDrag; framed: boolean }>) {
  const { surface, box } = tile;
  const view = useStore((s) => s.view)!;
  const table = useStore((s) => s.table)!;
  const redrawKey = useStore((s) => s.redrawKey);
  const shiftDown = useStore((s) => s.shiftDown);
  const viewport = useStore((s) => viewportOf(s, surface));
  const target = useStore((s) => s.dropSurface === surface);
  const stage = useRef<Konva.Stage | null>(null);
  const marquee = useMarquee(surface);
  const pointer = useHover(drag.nodes, stage);
  const color = useSurfaceColor(surface);
  return (
    <div
      className={`surface-tile${framed ? ' framed' : ''}${target ? ' drop-target' : ''}`}
      data-surface={surface}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        ...(framed && color ? { boxShadow: `inset 0 0 0 3px ${color}` } : {}),
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(HAND_DRAG)) e.preventDefault();
      }}
      onDrop={(e) => dropFromHand(e, surface)}
    >
      <Stage
        ref={(node) => {
          stage.current = node;
          setSnapshotStage(surface, node);
        }}
        width={box.width}
        height={box.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={!shiftDown && !marquee.box}
        onDragEnd={(e) => {
          if (e.target.nodeType === 'Stage') panned(surface, e.target.x(), e.target.y());
        }}
        onMouseDown={marquee.onMouseDown}
        onMouseMove={(e) => {
          pointer.onMouseMove(e);
          marquee.onMouseMove(e);
        }}
        onMouseLeave={pointer.onMouseLeave}
        onMouseUp={() => marquee.onMouseUp(topLevel(table, surface))}
        onWheel={(e) => onWheel(e, surface)}
      >
        <Layer key={redrawKey}>
          <DrawScale.Provider value={viewport.scale}>
            <Objects drag={drag} surface={surface} />
            <BagBadges types={view.types} surface={surface} />
            <SnapHints surface={surface} />
            <PromptPlaces surface={surface} />
            {marquee.box && <Marquee box={marquee.box} scale={viewport.scale} />}
          </DrawScale.Provider>
        </Layer>
      </Stage>
      {framed && <TileLabel surface={surface} color={color} />}
    </div>
  );
}

/** A tile's name, with a button to show it on its own or go back to all tiles. */
function TileLabel({ surface, color }: Readonly<{ surface: string; color?: string }>) {
  const focused = useStore((s) => s.focus === surface);
  const name = useStore((s) =>
    s.table ? surfacesOf(s.table).find((x) => x.id === surface)?.name : undefined,
  );
  return (
    <div className="surface-tile-label" onDoubleClick={() => toggleFocus(surface)}>
      {color && <span className="swatch" style={{ background: color }} />}
      <span>{name ?? surface}</span>
      <button
        type="button"
        title={focused ? 'Back to all tiles' : 'Show only this surface'}
        aria-label={focused ? 'Back to all tiles' : `Show only ${name ?? surface}`}
        onClick={() => toggleFocus(surface)}
      >
        {focused ? '⤡' : '⤢'}
      </button>
    </div>
  );
}

/** The colour a surface's tile is framed with, if it has one. */
function useSurfaceColor(surface: string): string | undefined {
  return useStore((s) =>
    s.table && s.view
      ? surfaceColor(
          surfacesOf(s.table).find((x) => x.id === surface),
          s.view.assets.colors,
        )
      : undefined,
  );
}

/** Keeps where a surface's canvas was dragged to. */
function panned(surface: string, x: number, y: number) {
  useStore.setState((s) => ({
    viewports: { ...s.viewports, [surface]: { ...viewportOf(s, surface), x, y } },
  }));
}

function Marquee({ box, scale }: Readonly<{ box: { from: Vec; to: Vec }; scale: number }>) {
  return (
    <Rect
      x={Math.min(box.from[0], box.to[0])}
      y={Math.min(box.from[1], box.to[1])}
      width={Math.abs(box.to[0] - box.from[0])}
      height={Math.abs(box.to[1] - box.from[1])}
      fill="rgba(47,129,247,0.12)"
      stroke="#2f81f7"
      strokeWidth={1 / scale}
      listening={false}
    />
  );
}

/** The objects lying on a surface, bottom to top. */
function Objects({ drag, surface }: Readonly<{ drag: TableDrag; surface: string }>) {
  const view = useStore((s) => s.view)!;
  const table = useStore((s) => s.table)!;
  const selection = useStore((s) => s.selection);
  const hovered = useStore((s) => s.hovered);
  const shiftDown = useStore((s) => s.shiftDown);
  const prompt = useStore((s) => s.prompts[0]);
  const picked = useStore((s) => s.picked);
  // What a prompt picked shows as selected; what it asks about glows.
  const selected = new Set([...selection, ...picked]);
  const marked = promptMarks(prompt);
  const types = view.types;
  return topLevel(table, surface).map((object) => {
    const common = {
      types,
      assets: view.assets,
      highlight: highlightOf(object, selected, marked, hovered),
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

/**
 * A selected object shows as selected even under the pointer. A stack glows when a
 * prompt asks about any card in it, such as one in a spread-out market.
 */
function highlightOf(
  object: TableObject,
  selected: Set<string>,
  marked: Set<string>,
  hovered: string | undefined,
): Highlight | undefined {
  if (selected.has(object.id)) return 'selected';
  if (object.id === hovered) return 'hovered';
  const inside = object.kind === 'stack' ? object.items : [];
  return [object.id, ...inside].some((id) => marked.has(id)) ? 'prompted' : undefined;
}

/** Selects what was clicked; a plain click on a piece in a crowded group also lists the group. */
function click(object: TableObject, evt: MouseEvent) {
  const { table, view, select, hoveredPiece } = useStore.getState();
  // A prompt asking for pieces takes the click: the card pointed at, or the whole object.
  if (hoveredPiece && clickForPrompt(hoveredPiece, 'pick')) return;
  if (clickForPrompt(object.id, 'pick')) return;
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

/** Shift-dragging on an empty surface selects everything in a box; a click there clears the selection. */
function useMarquee(surface: string) {
  const [box, setBox] = useState<{ from: Vec; to: Vec } | undefined>();
  const pointer = (stage: Konva.Stage) =>
    toWorld(viewportOf(useStore.getState(), surface), stage.getPointerPosition() ?? { x: 0, y: 0 });
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

/** The tiles for the surfaces shown, laid out on the page as it is now. */
function useTiles(): Tile[] {
  const table = useStore((s) => s.table);
  // Joined, so the selector only changes when the list does.
  const shown = useStore((s) => shownNow(s).join('\n'));
  const hand = useStore((s) => (s.handMinimized ? 0 : s.handHeight));
  const { width, height } = useWindowSize();
  if (!table) return [];
  return tilesFor(table, shown.split('\n'), { width, height, hand });
}

/**
 * Fits each tile to its surface when the table first arrives, and again whenever
 * different surfaces are shown, since every tile changes size then.
 */
function useFitOnLayout(tiles: Tile[]) {
  const view = useStore((s) => s.view);
  const table = useStore((s) => s.table);
  const fitted = useRef<string | undefined>(undefined);
  const layout = tiles.map((t) => t.surface).join('\n');
  useEffect(() => {
    if (!view || !table || fitted.current === layout) return;
    fitted.current = layout;
    for (const tile of tiles) fitTile(table, view.types, tile);
  }, [layout, view, table, tiles]);
}

/** A card dragged out of the hand tray onto a tile: play it onto a pile, a spot or the surface. */
function dropFromHand(e: React.DragEvent<HTMLDivElement>, surface: string) {
  const id = e.dataTransfer.getData(HAND_DRAG);
  const { table, view, command } = useStore.getState();
  if (!id || !table || !view || table.objects[id]?.kind !== 'piece') return;
  e.preventDefault();
  if (overHandTray(e.clientX, e.clientY)) return;
  const box = e.currentTarget.getBoundingClientRect();
  const viewport = viewportOf(useStore.getState(), surface);
  const point = toWorld(viewport, { x: e.clientX - box.left, y: e.clientY - box.top });
  const drop = { id, point, surface, faceDown: e.altKey };
  for (const c of handDropCommands(table, view.types, drop)) command(c);
}

function onWheel(e: Konva.KonvaEventObject<WheelEvent>, surface: string) {
  e.evt.preventDefault();
  const pointer = e.target.getStage()?.getPointerPosition();
  if (pointer) zoomAt(surface, pointer, Math.exp(-e.evt.deltaY * 0.0015));
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
