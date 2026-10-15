import { stackOffsets, type Piece, type Stack, type TableState } from '@trayful/core';
import type Konva from 'konva';
import { Circle, Group, Rect, Text } from 'react-konva';
import type { Vec } from './drops';
import { Component } from './render/Component';
import { facePiece, sizeOf, type Types } from './render/geometry';
import { useStore } from './store';

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

export function PieceView({
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

/** What a card of a stack does when dragged off it. */
interface DrawEvents {
  onDrawStart: () => void;
  onDrawMove: (node: Konva.Group) => void;
  onDrawEnd: (pieceId: string, node: Konva.Group, home: Vec) => void;
}

export function StackView({
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
}: ObjectViewProps &
  DrawEvents & {
    stack: Stack;
    table: TableState;
    wholeStack: boolean;
  }) {
  const top = facePiece(table, stack);
  const type = top && types[top.type];
  if (!top || !type) return null;
  const [w, h] = sizeOf(type);
  const cards = {
    types,
    palette,
    selected,
    drawable: !wholeStack && !stack.locked,
    events: { onDrawStart, onDrawMove, onDrawEnd },
  };
  // A fan or spread shows every card, and any of them can be taken.
  const offsets = stack.layout ? stackOffsets(stack.layout, stack.items.length, [w, h]) : [];
  const badge: Vec = [(offsets.at(-1)?.[0] ?? 0) + w / 2 - 1, -h / 2 + 1];

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
      {stack.layout ? (
        stack.items.map((id, i) => {
          const piece = table.objects[id];
          return piece?.kind === 'piece' ? (
            <StackCard key={id} piece={piece} home={offsets[i]!} {...cards} />
          ) : null;
        })
      ) : (
        <Pile stack={stack} table={table} top={top} size={[w, h]} cards={cards} />
      )}
      <CountBadge count={stack.items.length} at={badge} />
    </Group>
  );
}

type CardOptions = Readonly<{
  types: Types;
  palette: Record<string, string>;
  selected: boolean;
  drawable: boolean;
  events: DrawEvents;
}>;

/** A pile seen from above: the top card, the edges of those underneath, and the next card. */
function Pile({
  stack,
  table,
  top,
  size: [w, h],
  cards,
}: Readonly<{ stack: Stack; table: TableState; top: Piece; size: Vec; cards: CardOptions }>) {
  const depth = Math.min(stack.items.length - 1, 4);
  const second = table.objects[stack.items.at(-2) ?? ''] as Piece | undefined;
  const secondType = second && cards.types[second.type];
  return (
    <>
      {/* Edges of the cards underneath, so a stack reads as a pile. */}
      {Array.from({ length: depth }, (_, i) => (
        <Rect
          key={i}
          x={-w / 2 + (depth - i) * 0.6}
          y={-h / 2 + (depth - i) * 0.6}
          width={w}
          height={h}
          cornerRadius={cards.types[top.type]?.corner ?? 0}
          fill="#e6e0d4"
          stroke="#8a8072"
          strokeWidth={0.25}
          listening={false}
        />
      ))}
      {/* While the top card is dragged away, the next one shows underneath. */}
      {second && secondType && (
        <Group listening={false}>
          <Component piece={second} type={secondType} palette={cards.palette} />
        </Group>
      )}
      {/* Keyed by card, so a new top card gets a fresh node rather than the one dragged away. */}
      <StackCard key={top.id} piece={top} home={[0, 0]} {...cards} />
    </>
  );
}

/** A card that can be dragged out of the stack, starting from `home` inside the stack. */
function StackCard({
  piece,
  home,
  types,
  palette,
  selected,
  drawable,
  events,
}: Readonly<{ piece: Piece; home: Vec }> & CardOptions) {
  const type = types[piece.type];
  if (!type) return null;
  return (
    <Group
      x={home[0]}
      y={home[1]}
      draggable={drawable}
      onDragStart={(e) => {
        e.cancelBubble = true;
        e.currentTarget.moveToTop();
        events.onDrawStart();
      }}
      onDragMove={(e) => {
        e.cancelBubble = true;
        events.onDrawMove(e.currentTarget as Konva.Group);
      }}
      onDragEnd={(e) => {
        e.cancelBubble = true;
        events.onDrawEnd(piece.id, e.currentTarget as Konva.Group, home);
      }}
    >
      <Component piece={piece} type={type} palette={palette} selected={selected} />
    </Group>
  );
}

/** How many cards a stack holds, in its top-right corner. */
function CountBadge({ count, at }: Readonly<{ count: number; at: Vec }>) {
  return (
    <Group x={at[0]} y={at[1]} listening={false}>
      <Circle radius={5.5} fill="#2e3440" stroke="white" strokeWidth={0.4} />
      <Text
        text={String(count)}
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
  );
}

/** Outlines where the dragged piece could snap, with the spot it would snap to filled in. */
export function SnapHints() {
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
