import type { Piece, Stack, TableState } from '@trayful/core';
import type { Assets } from '@trayful/formats/browser';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { Vec } from './drops';
import { STACK_CARD } from './hover';
import { Component, type Highlight, type Ring } from '../render/Component';
import type { Place } from '../motion/glides';
import { RIFFLE_CARDS, riffleFrame } from '../motion/shuffles';
import { useCardGlide } from '../motion/useGlide';
import type { Types } from '../render/geometry';

/** What a card of a stack does when dragged off it. */
export interface DrawEvents {
  onDrawStart: () => void;
  onDrawMove: (node: Konva.Group) => void;
  onDrawEnd: (pieceId: string, node: Konva.Group, home: Vec) => void;
}

export type CardOptions = Readonly<{
  types: Types;
  assets: Assets;
  highlight?: Highlight;
  drawable: boolean;
  events: DrawEvents;
  ring?: Ring;
  /** Where the stack lies, so a card gliding into it can start from where it was. */
  stackAt: Place;
}>;

/**
 * A pile seen from above: the top card, the edges of those underneath, and the next card.
 * While it is shuffled, `shuffling` ms in, it riffles instead.
 */
export function Pile({
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
export function StackCard({
  piece,
  home,
  types,
  assets,
  highlight,
  drawable,
  events,
  ring,
  stackAt,
}: Readonly<{ piece: Piece; home: Vec }> & CardOptions) {
  const at = useCardGlide(piece.id, home, stackAt);
  const type = types[piece.type];
  if (!type) return null;
  return (
    <Group
      id={piece.id}
      name={STACK_CARD}
      {...at}
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
      <Component piece={piece} type={type} assets={assets} highlight={highlight} ring={ring} />
    </Group>
  );
}
