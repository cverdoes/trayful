import { stackOffsets, type Piece, type Stack, type TableState } from '@trayful/core';
import type { Assets, ComponentType } from '@trayful/formats/browser';
import type Konva from 'konva';
import { useContext } from 'react';
import { Circle, Group, Rect, Text } from 'react-konva';
import { bagsOn, drawFromBag } from './bags';
import type { Vec } from './drops';
import { MarkTargets } from './MarkTargets';
import { Component, DrawScale, type Highlight } from '../render/Component';
import { Marks } from '../render/Marks';
import { useMotionClock } from '../motion/motions';
import { useRoll } from '../motion/rolls';
import { placed, ringOf, useGlide } from '../motion/useGlide';
import { gatherFrame } from '../motion/shuffles';
import { facePiece, sizeOf, type Types } from '../render/geometry';
import { useStore } from '../store';
import { Pile, StackCard, type DrawEvents } from './StackCards';
import { setCursor } from './cursor';

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
      types={types}
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
  types,
  assets,
  highlight,
  register,
  ...events
}: ObjectViewProps & { piece: Piece; type: ComponentType }) {
  const moving = useStore((s) => s.moving[piece.id]);
  const roll = useRoll(moving?.kind === 'roll' ? moving.at : undefined, type);
  const glide = useGlide(piece.id, piece);
  const counter = type.is === 'counter';
  const shown = glide?.shows ?? piece;
  const scale = (roll?.scale ?? 1) * (glide?.scale ?? 1);
  return (
    <Group
      ref={register}
      {...placed(piece, glide)}
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
      <Group rotation={roll?.turn ?? 0} scaleX={scale * (glide?.flipScale ?? 1)} scaleY={scale}>
        <Component
          piece={roll?.value === undefined ? shown : { ...shown, value: roll.value }}
          type={type}
          assets={assets}
          highlight={highlight}
          ring={ringOf(glide)}
        />
      </Group>
      <Marks piece={piece} types={types} assets={assets} />
      <MarkTargets piece={piece} types={types} />
    </Group>
  );
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
  const glide = useGlide(stack.id, stack);
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
    ring: ringOf(glide),
    stackAt: stack,
  };
  // A fan or spread shows every card, and any of them can be taken.
  const offsets = stack.layout ? stackOffsets(stack.layout, stack.items.length, [w, h]) : [];
  // While shuffled, laid-out cards gather into one spot and spread out again.
  const gathered = shuffling === undefined ? 0 : (gatherFrame(shuffling) ?? 0);
  const badge: Vec = [(offsets.at(-1)?.[0] ?? 0) + w / 2 - 1, -h / 2 + 1];

  return (
    <Group
      ref={register}
      {...placed(stack, glide)}
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
 * How many pieces each bag on a surface holds, in its top-right corner. Clicking the count
 * draws one at random into your hand.
 */
export function BagBadges({ types, surface }: Readonly<{ types: Types; surface: string }>) {
  const table = useStore((s) => s.table);
  const player = useStore((s) => s.me?.player?.id);
  const command = useStore((s) => s.command);
  if (!table) return null;
  return (
    <>
      {bagsOn(table, types, surface).map((bag) => {
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

/**
 * Outlines where the piece dragged across a surface could snap, with the spot it
 * would snap to filled in.
 */
export function SnapHints({ surface }: Readonly<{ surface: string }>) {
  const hint = useStore((s) => s.snapHint);
  const scale = useContext(DrawScale) ?? 1;
  if (hint?.surface !== surface) return null;
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
