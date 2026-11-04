import type { TableObject } from '@trayful/core';
import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { facePiece } from './render/geometry';
import { useStore } from './store';

/** The name of a card's node inside a stack, whose id is the card's id. */
export const STACK_CARD = 'stack-card';

/**
 * Keeps track of the object under the pointer, which keys act on. Locked objects,
 * such as a board in place, are part of the table and do not light up.
 *
 * The table changing under a still pointer is checked too: a flipped card can come
 * back under a new id, as a new node, and pressing F again should turn it back.
 * Returns the stage's pointer events.
 */
export function useHover(nodes: ReadonlyMap<string, Konva.Group>) {
  const table = useStore((s) => s.table);
  const onStage = useRef(false);
  useEffect(() => {
    if (!onStage.current) return;
    // Wait for the canvas to draw the new table, so the pointer is tested against it.
    const frame = requestAnimationFrame(() => hoverShape(nodes, shapeUnderPointer(nodes)));
    return () => cancelAnimationFrame(frame);
  }, [table, nodes]);
  return {
    onMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => {
      onStage.current = true;
      hoverShape(nodes, e.target);
    },
    onMouseLeave: () => {
      onStage.current = false;
      hoverShape(nodes, undefined);
    },
  };
}

/**
 * Lights up the object `shape` is part of, or nothing, and notes the piece under
 * the pointer for the magnifier. That can be a locked board too: it does not light
 * up, but its text may still need reading.
 */
export function hoverShape(nodes: ReadonlyMap<string, Konva.Group>, shape: Konva.Node | undefined) {
  const state = useStore.getState();
  const id = shape && objectOf(nodes, shape);
  const object = id === undefined ? undefined : state.table?.objects[id];
  const hovered = object && !object.locked ? object.id : undefined;
  const hoveredPiece = object && shape && pieceOf(object, shape);
  if (hovered !== state.hovered || hoveredPiece !== state.hoveredPiece) {
    useStore.setState({ hovered, hoveredPiece });
  }
}

/** The piece of `object` a shape belongs to: the card pointed at in a fan, or the top of a pile. */
function pieceOf(object: TableObject, shape: Konva.Node): string | undefined {
  if (object.kind === 'piece') return object.id;
  const card = shape.findAncestors(`.${STACK_CARD}`, true).at(0)?.id();
  if (card && object.items.includes(card)) return card;
  const { table } = useStore.getState();
  return table && facePiece(table, object)?.id;
}

/** Which object on the table a shape on the canvas is part of. */
function objectOf(nodes: ReadonlyMap<string, Konva.Group>, shape: Konva.Node): string | undefined {
  for (const [id, node] of nodes) if (node === shape || node.isAncestorOf(shape)) return id;
  return undefined;
}

function shapeUnderPointer(nodes: ReadonlyMap<string, Konva.Group>): Konva.Node | undefined {
  const stage = nodes.values().next().value?.getStage();
  const pointer = stage?.getPointerPosition();
  return (pointer && stage?.getIntersection(pointer)) ?? undefined;
}
