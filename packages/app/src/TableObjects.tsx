import { stackOffsets, type Piece, type Stack, type TableState } from '@trayful/core';
import type { Assets, ComponentType } from '@trayful/formats/browser';
import type Konva from 'konva';
import { Circle, Group, Rect, Text } from 'react-konva';
import { bagsOn, drawFromBag } from './bags';
import type { Vec } from './drops';
import { Component, type Highlight } from './render/Component';
import { useMotionClock } from './motions';
import { useRoll } from './rolls';
import { gatherFrame, RIFFLE_CARDS, riffleFrame } from './shuffles';
import { facePiece, sizeOf, type Types } from './render/geometry';
import { useStore } from './store';

interface ObjectViewProps {
  types: Types;
  assets: Assets;
  highlight?: Highlight;
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
  assets,
  highlight,
  register,
  ...events
}: ObjectViewProps & { piece: Piece }) {
  const type = types[piece.type];
  if (!type) return null;
  return (
    <TypedPieceView
      piece={piece}
      type={type}
      assets={assets}
      highlight={highlight}
      register={register}
      {...events}
    />
  );
}

function TypedPieceView({
  piece,
  type,
  assets,
  highlight,
  register,
  ...events
}: Omit<ObjectViewProps, 'types'> & { piece: Piece; type: ComponentType }) {
  const moving = useStore((s) => s.moving[piece.id]);
  const roll = useRoll(moving?.kind === 'roll' ? moving.at : undefined, type);
  const counter = type.is === 'counter';
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
      <Group rotation={roll?.turn ?? 0} scaleX={roll?.scale ?? 1} scaleY={roll?.scale ?? 1}>
        <Component
          piece={roll?.value === undefined ? piece : { ...piece, value: roll.value }}
          type={type}
          assets={assets}
          highlight={highlight}
        />
      </Group>
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
  assets,
  highlight,
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
  const moving = useStore((s) => s.moving[stack.id]);
  const shuffling = useMotionClock('shuffle', moving?.kind === 'shuffle' ? moving.at : undefined);
  const top = facePiece(table, stack);
  const type = top && types[top.type];
  if (!top || !type) return null;
  const [w, h] = sizeOf(type);
  const cards = {
    types,
    assets,
    highlight,
    drawable: !wholeStack && !stack.locked,
    events: { onDrawStart, onDrawMove, onDrawEnd },
  };
  // A fan or spread shows every card, and any of them can be taken.
  const offsets = stack.layout ? stackOffsets(stack.layout, stack.items.length, [w, h]) : [];
  // While shuffled, laid-out cards gather into one spot and spread out again.
  const gathered = shuffling === undefined ? 0 : (gatherFrame(shuffling) ?? 0);
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
            <StackCard
              key={id}
              piece={piece}
              home={[offsets[i]![0] * (1 - gathered), offsets[i]![1] * (1 - gathered)]}
              {...cards}
            />
          ) : null;
        })
      ) : (
        <Pile
          stack={stack}
          table={table}
          top={top}
          size={[w, h]}
          cards={cards}
          shuffling={shuffling}
        />
      )}
      <CountBadge count={stack.items.length} at={badge} />
    </Group>
  );
}

type CardOptions = Readonly<{
  types: Types;
  assets: Assets;
  highlight?: Highlight;
  drawable: boolean;
  events: DrawEvents;
}>;

/**
 * A pile seen from above: the top card, the edges of those underneath, and the next card.
 * While it is shuffled, `shuffling` ms in, it riffles instead.
 */
function Pile({
  stack,
  table,
  top,
  size: [w, h],
  cards,
  shuffling,
}: Readonly<{
  stack: Stack;
  table: TableState;
  top: Piece;
  size: Vec;
  cards: CardOptions;
  shuffling?: number;
}>) {
  if (shuffling !== undefined) {
    return <Riffle stack={stack} table={table} elapsed={shuffling} width={w} cards={cards} />;
  }
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
          cornerRadius={cards.types[top.type]?.face?.corner ?? 0}
          fill="#e6e0d4"
          stroke="#8a8072"
          strokeWidth={0.25}
          listening={false}
        />
      ))}
      {/* While the top card is dragged away, the next one shows underneath. */}
      {second && secondType && (
        <Group listening={false}>
          <Component piece={second} type={secondType} assets={cards.assets} />
        </Group>
      )}
      {/* Keyed by card, so a new top card gets a fresh node rather than the one dragged away. */}
      <StackCard key={top.id} piece={top} home={[0, 0]} {...cards} />
    </>
  );
}

/** A pile being shuffled: its top cards split into two halves and riffle back together. */
function Riffle({
  stack,
  table,
  elapsed,
  width,
  cards,
}: Readonly<{
  stack: Stack;
  table: TableState;
  elapsed: number;
  width: number;
  cards: CardOptions;
}>) {
  const ids = stack.items.slice(-RIFFLE_CARDS);
  const placements = riffleFrame(elapsed, ids.length, width) ?? [];
  return (
    <Group listening={false}>
      {ids.map((id, i) => {
        const piece = table.objects[id];
        const type = piece?.kind === 'piece' ? cards.types[piece.type] : undefined;
        const place = placements[i];
        if (piece?.kind !== 'piece' || !type || !place) return null;
        return (
          <Group key={id} x={place.x} y={place.y} rotation={place.rot}>
            <Component piece={piece} type={type} assets={cards.assets} />
          </Group>
        );
      })}
    </Group>
  );
}

/** A card that can be dragged out of the stack, starting from `home` inside the stack. */
function StackCard({
  piece,
  home,
  types,
  assets,
  highlight,
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
      <Component piece={piece} type={type} assets={assets} highlight={highlight} />
    </Group>
  );
}

/** How many cards a stack or bag holds, drawn at a corner. */
function CountBadge({
  count,
  at,
  listening = false,
}: Readonly<{ count: number; at: Vec; listening?: boolean }>) {
  return (
    <Group x={at[0]} y={at[1]} listening={listening}>
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

/**
 * How many pieces each bag holds, in its top-right corner. Clicking the count
 * draws one at random into your hand.
 */
export function BagBadges({ types }: Readonly<{ types: Types }>) {
  const table = useStore((s) => s.table);
  const player = useStore((s) => s.me?.player?.id);
  const command = useStore((s) => s.command);
  if (!table) return null;
  return (
    <>
      {bagsOn(table, types).map((bag) => {
        const [w, h] = bag.spot.area!;
        const draw = drawFromBag(bag, player);
        return (
          <Group
            key={bag.spot.ref}
            x={bag.spot.pos[0]}
            y={bag.spot.pos[1]}
            rotation={bag.spot.rot}
            name="bag-count"
            onClick={(e) => {
              e.cancelBubble = true;
              if (draw) command(draw);
            }}
            onMouseEnter={(e) => draw && setCursor(e, 'pointer')}
            onMouseLeave={(e) => setCursor(e, '')}
          >
            <CountBadge count={bag.count} at={[w / 2, -h / 2]} listening />
          </Group>
        );
      })}
    </>
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
