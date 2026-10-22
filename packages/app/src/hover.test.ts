import type { TableState } from '@trayful/core';
import Konva from 'konva';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hoverShape } from './hover';
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
});
