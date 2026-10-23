import type { Stack, TableState } from '@trayful/core';
import Konva from 'konva';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hoverShape, STACK_CARD } from './hover';
import { useStore } from './store';
import { exampleTable } from './testing';

let table: TableState;
const initial = useStore.getState();

beforeAll(async () => {
  ({ table } = await exampleTable());
});

beforeEach(() => {
  useStore.setState({ ...initial, table: { ...table, hands: {}, bags: {} } }, true);
});

/** Canvas nodes for a card and the board, each with a shape drawn inside. */
function scene() {
  const card = new Konva.Group();
  const board = new Konva.Group();
  const face = new Konva.Rect();
  const boardFace = new Konva.Rect();
  card.add(face);
  board.add(boardFace);
  const nodes = new Map([
    ['action-card.raid.1', card],
    ['main-board', board],
  ]);
  return { nodes, face, boardFace };
}

describe('hoverShape', () => {
  it('lights up the object a shape under the pointer belongs to', () => {
    const { nodes, face } = scene();
    hoverShape(nodes, face);
    expect(useStore.getState().hovered).toBe('action-card.raid.1');
  });

  it('leaves locked objects, empty table and the pointer leaving dark', () => {
    const { nodes, face, boardFace } = scene();
    hoverShape(nodes, face);
    hoverShape(nodes, boardFace);
    expect(useStore.getState().hovered).toBeUndefined();
    hoverShape(nodes, face);
    hoverShape(nodes, new Konva.Rect());
    expect(useStore.getState().hovered).toBeUndefined();
    hoverShape(nodes, face);
    hoverShape(nodes, undefined);
    expect(useStore.getState().hovered).toBeUndefined();
  });

  it('notes the piece under the pointer, a locked board included, for the magnifier', () => {
    const { nodes, face, boardFace } = scene();
    hoverShape(nodes, face);
    expect(useStore.getState().hoveredPiece).toBe('action-card.raid.1');
    hoverShape(nodes, boardFace);
    expect(useStore.getState().hoveredPiece).toBe('main-board');
    hoverShape(nodes, undefined);
    expect(useStore.getState().hoveredPiece).toBeUndefined();
  });

  it('notes the card pointed at in a stack, or else its top card', () => {
    const stack = Object.values(table.objects).find((o): o is Stack => o.kind === 'stack')!;
    const node = new Konva.Group();
    const card = new Konva.Group({ id: stack.items[0], name: STACK_CARD });
    const cardFace = new Konva.Rect();
    const edge = new Konva.Rect();
    card.add(cardFace);
    node.add(card, edge);
    const nodes = new Map([[stack.id, node]]);
    hoverShape(nodes, cardFace);
    expect(useStore.getState().hoveredPiece).toBe(stack.items[0]);
    hoverShape(nodes, edge);
    expect(useStore.getState().hoveredPiece).toBe(stack.items.at(-1));
  });
});
