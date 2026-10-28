import type Konva from 'konva';

/** Shows `cursor` over the table, such as `grab` over a piece that can be dragged. */
export function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string) {
  const container = e.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}
