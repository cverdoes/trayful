import type { Piece, Stack, TableObject, TableState } from '@trayful/core';
import type Konva from 'konva';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Group, Layer, Rect, Stage, Text } from 'react-konva';
import { Component } from './render/Component';
import { dropTarget, facePiece, sizeOf, topLevel, type Types } from './render/geometry';
import { setSnapshotStage } from './snapshot';
import { useStore } from './store';
import { fitToTable, zoomAt } from './viewport';

type Vec = [number, number];

/** Below this distance in millimetres a drag counts as a click. */
const CLICK_SLOP = 0.8;

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

  const onDragStart = (id: string) => {
    const state = useStore.getState();
    if (!state.selection.includes(id)) state.select([id]);
    dragStart.current.clear();
    for (const other of ids(id).length > 1 && selected.has(id) ? selection : [id]) {
      const o = table.objects[other];
      if (o) dragStart.current.set(other, [o.pos[0], o.pos[1]]);
    }
  };

  const onDragMove = (id: string, node: Konva.Group) => {
    const start = dragStart.current.get(id);
    if (!start) return;
    const dx = node.x() - start[0];
    const dy = node.y() - start[1];
    for (const [other, pos] of dragStart.current) {
      if (other !== id) nodes.current.get(other)?.position({ x: pos[0] + dx, y: pos[1] + dy });
    }
  };

  const onDragEnd = (id: string, node: Konva.Group) => {
    const start = dragStart.current.get(id);
    const moved = [...dragStart.current.keys()];
    dragStart.current.clear();
    if (!start) return;
    const by: Vec = [node.x() - start[0], node.y() - start[1]];
    if (Math.hypot(by[0], by[1]) < CLICK_SLOP) {
      restore(moved);
      return;
    }
    const point: Vec = [start[0] + by[0], start[1] + by[1]];
    const target = dropTarget(table, types, moved, point);
    const ordered = moved.sort((a, b) => table.objects[a]!.z - table.objects[b]!.z);
    const command = useStore.getState().command;
    if (target) command({ type: 'stack', ids: ordered, onto: target.id });
    else command({ type: 'move', ids: ordered, by });
  };

  const restore = (moved: string[]) => {
    for (const id of moved) {
      const o = table.objects[id];
      if (o) nodes.current.get(id)?.position({ x: o.pos[0], y: o.pos[1] });
    }
  };

  /** Dragging the top card off a stack draws it; dropping it on a pile stacks it there. */
  const onDrawEnd = (stack: Stack, node: Konva.Group) => {
    const offset: Vec = [node.x(), node.y()];
    if (Math.hypot(offset[0], offset[1]) < CLICK_SLOP) {
      node.position({ x: 0, y: 0 });
      useStore.getState().select([stack.id], useStore.getState().shiftDown ? 'toggle' : 'replace');
      return;
    }
    const rad = (stack.rot * Math.PI) / 180;
    const point: Vec = [
      stack.pos[0] + offset[0] * Math.cos(rad) - offset[1] * Math.sin(rad),
      stack.pos[1] + offset[0] * Math.sin(rad) + offset[1] * Math.cos(rad),
    ];
    const top = stack.items.at(-1)!;
    const target = dropTarget(table, types, [stack.id], point);
    const { command, select } = useStore.getState();
    if (target?.id === stack.id) {
      node.position({ x: 0, y: 0 });
      return;
    }
    command({ type: 'draw', from: stack.id, to: point });
    if (target) command({ type: 'stack', ids: [top], onto: target.id });
    else select([top]);
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

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) zoomAt(pointer, Math.exp(-e.evt.deltaY * 0.0015));
  };

  return (
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
              onDrawEnd={(node) => onDrawEnd(object, node)}
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
  onDrawEnd,
  ...events
}: ObjectViewProps & {
  stack: Stack;
  table: TableState;
  wholeStack: boolean;
  onDrawEnd: (node: Konva.Group) => void;
}) {
  const top = facePiece(table, stack);
  const type = top && types[top.type];
  if (!top || !type) return null;
  const [w, h] = sizeOf(type);
  const depth = Math.min(stack.items.length - 1, 4);
  const second = table.objects[stack.items.at(-2) ?? ''] as Piece | undefined;
  const drawable = !wholeStack && !stack.locked;
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
      <Group
        key={top.id}
        draggable={drawable}
        onDragStart={(e) => {
          e.cancelBubble = true;
          useStore.getState().select([]);
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          onDrawEnd(e.currentTarget as Konva.Group);
        }}
      >
        <Component piece={top} type={type} palette={palette} selected={selected} />
      </Group>
      <Group x={w / 2 - 1} y={-h / 2 + 1} listening={false}>
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
