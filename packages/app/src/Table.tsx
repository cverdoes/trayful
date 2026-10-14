import {
  accepts,
  allSpots,
  ridersOf,
  snapFor,
  stackOffsets,
  type Piece,
  type SnapSpot,
  type Stack,
  type TableObject,
  type TableState,
} from '@trayful/core';
import type Konva from 'konva';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Group, Layer, Rect, Stage, Text } from 'react-konva';
import { HAND_DRAG, myId, overHandTray } from './Players';
import { Component } from './render/Component';
import { dropTarget, facePiece, pieceSize, sizeOf, topLevel, type Types } from './render/geometry';
import { setSnapshotStage } from './snapshot';
import { useStore } from './store';
import { fitToTable, zoomAt } from './viewport';

type Vec = [number, number];

/** Below this distance in millimetres a drag counts as a click. */
const CLICK_SLOP = 0.8;

/** How close in millimetres a dropped piece must be to a spot to snap into it. */
function snapRadius(size: [number, number]): number {
  return Math.max(8, Math.min(size[0], size[1]) / 2);
}

export function Table() {
  const view = useStore((s) => s.view);
  const table = useStore((s) => s.table);
  const selection = useStore((s) => s.selection);
  const redrawKey = useStore((s) => s.redrawKey);
  const shiftDown = useStore((s) => s.shiftDown);
  const viewport = useStore((s) => s.viewport);
  const size = useWindowSize();

  const nodes = useRef(new Map<string, Konva.Group>());
  const dragStart = useRef(new Map<string, Vec>());
  /** Pieces snapped onto a dragged object, which follow it. */
  const riderStart = useRef(new Map<string, Vec>());
  const [marquee, setMarquee] = useState<{ from: Vec; to: Vec } | undefined>();
  const fitted = useRef(false);

  useEffect(() => {
    if (!fitted.current && view && table) {
      fitted.current = true;
      fitToTable(table, view.types, size.width, size.height);
    }
  }, [view, table, size]);

  const toWorld = useCallback((stage: Konva.Stage): Vec => {
    const p = stage.getPointerPosition() ?? { x: 0, y: 0 };
    const { viewport: v } = useStore.getState();
    return [(p.x - v.x) / v.scale, (p.y - v.y) / v.scale];
  }, []);

  if (!view || !table) return <div className="loading">Loading table…</div>;
  const types = view.types;
  const objects = topLevel(table);
  const selected = new Set(selection);

  // --- Moving objects -------------------------------------------------------

  const ids = (id: string) => (selected.has(id) ? selection : [id]);

  /** Starts showing where the dragged object could snap. */
  const showSpots = (object: TableObject, ignore: ReadonlySet<string>) => {
    const piece = facePiece(table, object);
    const type = piece && types[piece.type];
    const spots = allSpots(table, types).filter((s) => !ignore.has(s.owner) && accepts(s, type));
    useStore.setState({
      snapHint: spots.length ? { spots, size: pieceSize(table, types, object) } : undefined,
    });
  };

  /** The spot a drop at `point` snaps to. Groups only snap into free areas. */
  const snapAt = (object: TableObject, point: Vec, ignore: ReadonlySet<string>, group: boolean) => {
    const piece = facePiece(table, object);
    const type = piece && types[piece.type];
    const size = pieceSize(table, types, object);
    const spot = snapFor(table, types, type, point, snapRadius(size), ignore);
    return spot && (spot.area || !group) ? spot : undefined;
  };

  const highlight = (spot: SnapSpot | undefined) => {
    const hint = useStore.getState().snapHint;
    if (hint && hint.active !== spot?.ref)
      useStore.setState({ snapHint: { ...hint, active: spot?.ref } });
  };

  const dragging = () => new Set([...dragStart.current.keys(), ...riderStart.current.keys()]);

  /** Whether the pointer of a drag on the canvas is over the hand tray. */
  const pointerOverHand = (node: Konva.Node): boolean => {
    const stage = node.getStage();
    const p = stage?.getPointerPosition();
    if (!stage || !p || !myId()) return false;
    const box = stage.container().getBoundingClientRect();
    return overHandTray(box.left + p.x, box.top + p.y);
  };

  /** Lights up the hand tray while something is dragged over it. */
  const hoverHand = (node: Konva.Node): boolean => {
    const over = pointerOverHand(node);
    if (useStore.getState().overHand !== over) useStore.setState({ overHand: over });
    return over;
  };

  const onDragStart = (id: string) => {
    const state = useStore.getState();
    if (!state.selection.includes(id)) state.select([id]);
    dragStart.current.clear();
    riderStart.current.clear();
    for (const other of ids(id).length > 1 && selected.has(id) ? selection : [id]) {
      const o = table.objects[other];
      if (o) dragStart.current.set(other, [o.pos[0], o.pos[1]]);
    }
    for (const rider of ridersOf(table.objects, dragStart.current.keys())) {
      const o = table.objects[rider];
      if (o && !dragStart.current.has(rider)) riderStart.current.set(rider, [o.pos[0], o.pos[1]]);
    }
    showSpots(table.objects[id]!, dragging());
  };

  const onDragMove = (id: string, node: Konva.Group) => {
    const start = dragStart.current.get(id);
    if (!start) return;
    const dx = node.x() - start[0];
    const dy = node.y() - start[1];
    for (const [other, pos] of [...dragStart.current, ...riderStart.current]) {
      if (other !== id) nodes.current.get(other)?.position({ x: pos[0] + dx, y: pos[1] + dy });
    }
    const point: Vec = [node.x(), node.y()];
    const moved = [...dragStart.current.keys()];
    if (hoverHand(node)) return highlight(undefined);
    const onPile = dropTarget(table, types, moved, point);
    highlight(onPile ? undefined : snapAt(table.objects[id]!, point, dragging(), moved.length > 1));
  };

  const onDragEnd = (id: string, node: Konva.Group) => {
    const start = dragStart.current.get(id);
    const moved = [...dragStart.current.keys()];
    const ignore = dragging();
    const riders = [...riderStart.current.keys()];
    dragStart.current.clear();
    riderStart.current.clear();
    const toHand = pointerOverHand(node);
    useStore.setState({ snapHint: undefined, overHand: false });
    if (!start) return;
    const by: Vec = [node.x() - start[0], node.y() - start[1]];
    if (Math.hypot(by[0], by[1]) < CLICK_SLOP) {
      restore([...moved, ...riders]);
      return;
    }
    const point: Vec = [start[0] + by[0], start[1] + by[1]];
    const target = dropTarget(table, types, moved, point);
    const ordered = moved.sort((a, b) => table.objects[a]!.z - table.objects[b]!.z);
    const command = useStore.getState().command;
    if (toHand) {
      // Riders stay on the table; only what was picked up goes into the hand.
      restore(riders);
      command({ type: 'move', ids: ordered, to: `hand:${myId()}` });
      return;
    }
    if (target) {
      command({ type: 'stack', ids: ordered, onto: target.id });
      return;
    }
    const spot = snapAt(table.objects[id]!, point, ignore, moved.length > 1);
    if (spot && !spot.area) command({ type: 'move', ids: [id], to: spot.ref });
    else command({ type: 'move', ids: ordered, by, ...(spot ? { into: spot.ref } : {}) });
  };

  const restore = (moved: string[]) => {
    for (const id of moved) {
      const o = table.objects[id];
      if (o) nodes.current.get(id)?.position({ x: o.pos[0], y: o.pos[1] });
    }
  };

  /** Where a card dragged out of a stack is, given its position inside the stack's group. */
  const fromStack = (stack: Stack, local: Vec): Vec => {
    const rad = (stack.rot * Math.PI) / 180;
    return [
      stack.pos[0] + local[0] * Math.cos(rad) - local[1] * Math.sin(rad),
      stack.pos[1] + local[0] * Math.sin(rad) + local[1] * Math.cos(rad),
    ];
  };

  const onDrawStart = (stack: Stack) => {
    useStore.getState().select([]);
    showSpots(stack, new Set([stack.id]));
  };

  const onDrawMove = (stack: Stack, node: Konva.Group) => {
    if (hoverHand(node)) return highlight(undefined);
    const point = fromStack(stack, [node.x(), node.y()]);
    const onPile = dropTarget(table, types, [stack.id], point);
    highlight(onPile ? undefined : snapAt(stack, point, new Set([stack.id]), false));
  };

  /**
   * Dragging a card off a stack draws it (or, from a fan or spread, takes that
   * card); dropping it on a pile stacks it there, and near a spot snaps it in.
   */
  const onDrawEnd = (stack: Stack, pieceId: string, node: Konva.Group, home: Vec) => {
    const toHand = pointerOverHand(node);
    useStore.setState({ snapHint: undefined, overHand: false });
    const local: Vec = [node.x(), node.y()];
    if (Math.hypot(local[0] - home[0], local[1] - home[1]) < CLICK_SLOP) {
      node.position({ x: home[0], y: home[1] });
      useStore.getState().select([stack.id], useStore.getState().shiftDown ? 'toggle' : 'replace');
      return;
    }
    const { command, select } = useStore.getState();
    if (toHand) {
      const hand = `hand:${myId()}`;
      if (pieceId === stack.items.at(-1) && !stack.layout) {
        command({ type: 'draw', from: stack.id, to: hand });
      } else command({ type: 'take', id: pieceId, to: hand });
      return;
    }
    const point = fromStack(stack, local);
    const target = dropTarget(table, types, [stack.id], point);
    if (target?.id === stack.id) {
      node.position({ x: home[0], y: home[1] });
      return;
    }
    const spot = target ? undefined : snapAt(stack, point, new Set([stack.id]), false);
    const to = spot && !spot.area ? spot.ref : point;
    if (pieceId === stack.items.at(-1) && !stack.layout)
      command({ type: 'draw', from: stack.id, to });
    else command({ type: 'take', id: pieceId, to });
    if (target) command({ type: 'stack', ids: [pieceId], onto: target.id });
    else select([pieceId]);
  };

  // --- Clicks and the stage ---------------------------------------------------

  const onObjectClick = (id: string, evt: MouseEvent) => {
    useStore
      .getState()
      .select([id], evt.shiftKey || evt.metaKey || evt.ctrlKey ? 'toggle' : 'replace');
  };

  const onObjectDoubleClick = (object: TableObject) => {
    const piece = facePiece(table, object);
    const base = piece && types[piece.type]?.base;
    const command = useStore.getState().command;
    if (base === 'die' && object.kind === 'piece') command({ type: 'roll', id: object.id });
    else if (base === 'card' || base === 'tile' || base === 'token')
      command({ type: 'flip', ids: [object.id] });
  };

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage || e.target !== stage) return;
    if (e.evt.shiftKey) {
      const p = toWorld(stage);
      setMarquee({ from: p, to: p });
    } else {
      useStore.getState().select([]);
    }
  };

  const onStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (marquee && stage) setMarquee({ from: marquee.from, to: toWorld(stage) });
  };

  const onStageMouseUp = () => {
    if (!marquee) return;
    const [x0, x1] = [
      Math.min(marquee.from[0], marquee.to[0]),
      Math.max(marquee.from[0], marquee.to[0]),
    ];
    const [y0, y1] = [
      Math.min(marquee.from[1], marquee.to[1]),
      Math.max(marquee.from[1], marquee.to[1]),
    ];
    const inside = objects
      .filter(
        (o) => !o.locked && o.pos[0] >= x0 && o.pos[0] <= x1 && o.pos[1] >= y0 && o.pos[1] <= y1,
      )
      .map((o) => o.id);
    useStore.getState().select(inside, 'add');
    setMarquee(undefined);
  };

  /** A card dragged out of the hand tray: play it onto a pile, a spot or the table. */
  const onDropFromHand = (e: React.DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData(HAND_DRAG);
    const piece = table.objects[id];
    if (!id || piece?.kind !== 'piece') return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const { viewport: v, command } = useStore.getState();
    const point: Vec = [
      (e.clientX - box.left - v.x) / v.scale,
      (e.clientY - box.top - v.y) / v.scale,
    ];
    if (overHandTray(e.clientX, e.clientY)) return;
    const face = e.altKey ? ('down' as const) : undefined;
    const target = dropTarget(table, types, [id], point);
    if (target && !face) {
      command({ type: 'stack', ids: [id], onto: target.id });
      return;
    }
    const spot = snapFor(
      table,
      types,
      types[piece.type],
      point,
      snapRadius(pieceSize(table, types, piece)),
      new Set([id]),
    );
    const to =
      spot && !spot.area
        ? spot.ref
        : ([Math.round(point[0] * 10) / 10, Math.round(point[1] * 10) / 10] as Vec);
    command({ type: 'move', ids: [id], to, ...(face ? { face } : {}) });
    if (target) command({ type: 'stack', ids: [id], onto: target.id });
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) zoomAt(pointer, Math.exp(-e.evt.deltaY * 0.0015));
  };

  return (
    <div
      className="table"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(HAND_DRAG)) e.preventDefault();
      }}
      onDrop={onDropFromHand}
    >
      <Stage
        ref={setSnapshotStage}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={!shiftDown && !marquee}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            useStore.setState((s) => ({
              viewport: { ...s.viewport, x: e.target.x(), y: e.target.y() },
            }));
          }
        }}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onWheel={onWheel}
      >
        <Layer key={redrawKey}>
          {objects.map((object) => {
            const handlers = {
              register: (node: Konva.Group | null) => {
                if (node) nodes.current.set(object.id, node);
                else nodes.current.delete(object.id);
              },
              onClick: (evt: MouseEvent) => onObjectClick(object.id, evt),
              onDoubleClick: () => onObjectDoubleClick(object),
            };
            return object.kind === 'stack' ? (
              <StackView
                key={object.id}
                stack={object}
                table={table}
                types={types}
                palette={view.palette}
                selected={selected.has(object.id)}
                wholeStack={shiftDown || (selected.has(object.id) && selection.length > 1)}
                onDragStart={() => onDragStart(object.id)}
                onDragMove={(node) => onDragMove(object.id, node)}
                onDragEnd={(node) => onDragEnd(object.id, node)}
                onDrawStart={() => onDrawStart(object)}
                onDrawMove={(node) => onDrawMove(object, node)}
                onDrawEnd={(pieceId, node, home) => onDrawEnd(object, pieceId, node, home)}
                {...handlers}
              />
            ) : (
              <PieceView
                key={object.id}
                piece={object}
                types={types}
                palette={view.palette}
                selected={selected.has(object.id)}
                onDragStart={() => onDragStart(object.id)}
                onDragMove={(node) => onDragMove(object.id, node)}
                onDragEnd={(node) => onDragEnd(object.id, node)}
                {...handlers}
              />
            );
          })}
          <SnapHints />
          {marquee && (
            <Rect
              x={Math.min(marquee.from[0], marquee.to[0])}
              y={Math.min(marquee.from[1], marquee.to[1])}
              width={Math.abs(marquee.to[0] - marquee.from[0])}
              height={Math.abs(marquee.to[1] - marquee.from[1])}
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

interface ObjectViewProps {
  types: Types;
  palette: Record<string, string>;
  selected: boolean;
  register: (node: Konva.Group | null) => void;
  onClick: (evt: MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: () => void;
  onDragMove: (node: Konva.Group) => void;
  onDragEnd: (node: Konva.Group) => void;
}

function PieceView({
  piece,
  types,
  palette,
  selected,
  register,
  ...events
}: ObjectViewProps & { piece: Piece }) {
  const type = types[piece.type];
  if (!type) return null;
  const counter = type.base === 'counter';
  return (
    <Group
      ref={register}
      x={piece.pos[0]}
      y={piece.pos[1]}
      rotation={piece.rot}
      draggable={!piece.locked}
      onClick={(e) => events.onClick(e.evt)}
      onTap={(e) => events.onClick(e.evt as unknown as MouseEvent)}
      onDblClick={events.onDoubleClick}
      onDragStart={events.onDragStart}
      onDragMove={(e) => events.onDragMove(e.currentTarget as Konva.Group)}
      onDragEnd={(e) => events.onDragEnd(e.currentTarget as Konva.Group)}
      onWheel={
        counter
          ? (e) => {
              e.cancelBubble = true;
              e.evt.preventDefault();
              const value = typeof piece.value === 'number' ? piece.value : 0;
              useStore.getState().command({
                type: 'setValue',
                id: piece.id,
                value: value + (e.evt.deltaY < 0 ? 1 : -1),
              });
            }
          : undefined
      }
      onMouseEnter={(e) => setCursor(e, piece.locked ? 'default' : 'grab')}
      onMouseLeave={(e) => setCursor(e, 'default')}
    >
      <Component piece={piece} type={type} palette={palette} selected={selected} />
    </Group>
  );
}

function StackView({
  stack,
  table,
  types,
  palette,
  selected,
  wholeStack,
  register,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  ...events
}: ObjectViewProps & {
  stack: Stack;
  table: TableState;
  wholeStack: boolean;
  onDrawStart: () => void;
  onDrawMove: (node: Konva.Group) => void;
  onDrawEnd: (pieceId: string, node: Konva.Group, home: Vec) => void;
}) {
  const top = facePiece(table, stack);
  const type = top && types[top.type];
  if (!top || !type) return null;
  const [w, h] = sizeOf(type);
  const drawable = !wholeStack && !stack.locked;

  /** A card that can be dragged out of the stack, starting from `home` inside the stack. */
  const card = (piece: Piece, home: Vec, show = true) => {
    const pieceType = types[piece.type];
    if (!pieceType) return null;
    return (
      <Group
        key={piece.id}
        x={home[0]}
        y={home[1]}
        draggable={drawable}
        visible={show}
        onDragStart={(e) => {
          e.cancelBubble = true;
          e.currentTarget.moveToTop();
          onDrawStart();
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          onDrawMove(e.currentTarget as Konva.Group);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          onDrawEnd(piece.id, e.currentTarget as Konva.Group, home);
        }}
      >
        <Component piece={piece} type={pieceType} palette={palette} selected={selected} />
      </Group>
    );
  };

  let body: React.ReactNode;
  let badge: Vec = [w / 2 - 1, -h / 2 + 1];
  if (stack.layout) {
    // A fan or spread: every card shows and any of them can be taken.
    const offsets = stackOffsets(stack.layout, stack.items.length, [w, h]);
    body = stack.items.map((id, i) => {
      const piece = table.objects[id];
      return piece?.kind === 'piece' ? card(piece, offsets[i]!) : null;
    });
    badge = [offsets.at(-1)![0] + w / 2 - 1, -h / 2 + 1];
  } else {
    const depth = Math.min(stack.items.length - 1, 4);
    const second = table.objects[stack.items.at(-2) ?? ''] as Piece | undefined;
    body = (
      <>
        {/* Edges of the cards underneath, so a stack reads as a pile. */}
        {Array.from({ length: depth }, (_, i) => (
          <Rect
            key={i}
            x={-w / 2 + (depth - i) * 0.6}
            y={-h / 2 + (depth - i) * 0.6}
            width={w}
            height={h}
            cornerRadius={type.corner ?? 0}
            fill="#e6e0d4"
            stroke="#8a8072"
            strokeWidth={0.25}
            listening={false}
          />
        ))}
        {/* While the top card is dragged away, the next one shows underneath. */}
        {second && types[second.type] && (
          <Group listening={false}>
            <Component piece={second} type={types[second.type]!} palette={palette} />
          </Group>
        )}
        {card(top, [0, 0])}
      </>
    );
  }

  return (
    <Group
      ref={register}
      x={stack.pos[0]}
      y={stack.pos[1]}
      rotation={stack.rot}
      draggable={wholeStack && !stack.locked}
      onClick={(e) => events.onClick(e.evt)}
      onDblClick={events.onDoubleClick}
      onDragStart={(e) => e.target === e.currentTarget && events.onDragStart()}
      onDragMove={(e) =>
        e.target === e.currentTarget && events.onDragMove(e.currentTarget as Konva.Group)
      }
      onDragEnd={(e) =>
        e.target === e.currentTarget && events.onDragEnd(e.currentTarget as Konva.Group)
      }
      onMouseEnter={(e) => setCursor(e, stack.locked ? 'default' : 'grab')}
      onMouseLeave={(e) => setCursor(e, 'default')}
    >
      {body}
      <Group x={badge[0]} y={badge[1]} listening={false}>
        <Circle radius={5.5} fill="#2e3440" stroke="white" strokeWidth={0.4} />
        <Text
          text={String(stack.items.length)}
          x={-7}
          y={-7}
          width={14}
          height={14}
          align="center"
          verticalAlign="middle"
          fontSize={5.5}
          fontStyle="bold"
          fill="white"
        />
      </Group>
    </Group>
  );
}

/** Outlines where the dragged piece could snap, with the spot it would snap to filled in. */
function SnapHints() {
  const hint = useStore((s) => s.snapHint);
  const scale = useStore((s) => s.viewport.scale);
  if (!hint) return null;
  const [w, h] = hint.size;
  return (
    <Group listening={false}>
      {hint.spots.map((spot) => {
        const active = spot.ref === hint.active;
        const [sw, sh] = spot.area ?? [w, h];
        return (
          <Group key={spot.ref} x={spot.pos[0]} y={spot.pos[1]} rotation={spot.rot}>
            <Rect
              x={-sw / 2}
              y={-sh / 2}
              width={sw}
              height={sh}
              cornerRadius={Math.min(sw, sh) / 8}
              stroke="#2f81f7"
              strokeWidth={(active ? 2.5 : 1.5) / scale}
              dash={active ? undefined : [6 / scale, 4 / scale]}
              fill={active ? 'rgba(47,129,247,0.25)' : 'rgba(47,129,247,0.06)'}
            />
          </Group>
        );
      })}
    </Group>
  );
}

function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
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
