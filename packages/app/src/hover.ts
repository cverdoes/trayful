import type Konva from 'konva';
import { useEffect, useRef } from 'react';
import { useStore } from './store';

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

/** Lights up the object `shape` is part of, or nothing. */
export function hoverShape(nodes: ReadonlyMap<string, Konva.Group>, shape: Konva.Node | undefined) {
  const { table, hovered } = useStore.getState();
  const id = shape && objectOf(nodes, shape);
  const object = id === undefined ? undefined : table?.objects[id];
  const next = object && !object.locked ? object.id : undefined;
  if (next !== hovered) useStore.setState({ hovered: next });
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
