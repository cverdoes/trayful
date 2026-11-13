import type Konva from 'konva';

/** A point on the page, in CSS pixels. */
export interface PagePoint {
  x: number;
  y: number;
}

/** A rectangle on a canvas or on the page, in CSS pixels. */
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A copy of what is being dragged, floating above every tile while the pointer is
 * outside the tile the drag started on.
 *
 * Each tile is a canvas of its own and clips what it draws at its edge, so without
 * the copy a piece dragged towards another tile is cut off at the border and then
 * gone until it is dropped. The pieces themselves are hidden while the copy shows,
 * so the part still inside the old tile does not show twice.
 */
export class DragGhost {
  private shown?: {
    element: HTMLCanvasElement;
    /** Where on the copy the pointer holds it, at the zoom it was taken at. */
    grab: PagePoint;
    /** The zoom of the tile the copy was taken from. */
    zoom: number;
    /** The dragged nodes, with the opacity each had before it was hidden. */
    hidden: [Konva.Node, number][];
  };

  /**
   * Shows the copy under the pointer when it is outside the tile of the dragged
   * nodes, drawn at the zoom of the tile it is over (`zoom`, or the zoom it was
   * taken at when it is over no tile), and takes it away when the pointer is back.
   */
  follow(nodes: Konva.Node[], pointer: PagePoint | undefined, zoom: number | undefined): void {
    const stage = nodes[0]?.getStage();
    if (!stage || !pointer) return;
    const tile = stage.container().getBoundingClientRect();
    if (inside(tile, pointer)) return this.clear();
    this.shown ??= take(nodes, pointer, tile, stage.scaleX());
    const { element, grab } = this.shown;
    const scale = (zoom ?? this.shown.zoom) / this.shown.zoom;
    const at = ghostCorner(grab, pointer, scale);
    element.style.transform = `translate(${at.x}px, ${at.y}px) scale(${scale})`;
  }

  /** Takes the copy away and shows the dragged pieces again. */
  clear(): void {
    if (!this.shown) return;
    this.shown.element.remove();
    for (const [node, opacity] of this.shown.hidden) node.opacity(opacity);
    this.shown = undefined;
  }
}

/**
 * Where the top left corner of the copy goes, so that the point it is held by stays
 * under the pointer when it is drawn `scale` times as large as it was taken.
 */
export function ghostCorner(grab: PagePoint, pointer: PagePoint, scale: number): PagePoint {
  return { x: pointer.x - grab.x * scale, y: pointer.y - grab.y * scale };
}

/** Draws the nodes onto a new canvas on top of the page, then hides them. */
function take(nodes: Konva.Node[], pointer: PagePoint, tile: DOMRect, zoom: number) {
  const parts = nodes.map((node) => ({ node, rect: node.getClientRect() }));
  const box = union(parts.map((p) => p.rect));
  const ratio = window.devicePixelRatio || 1;
  const element = document.createElement('canvas');
  element.className = 'drag-ghost';
  element.width = Math.ceil(box.width * ratio);
  element.height = Math.ceil(box.height * ratio);
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
  const context = element.getContext('2d');
  for (const { node, rect } of parts) {
    const image = node.toCanvas({ ...rect, pixelRatio: ratio });
    context?.drawImage(image, (rect.x - box.x) * ratio, (rect.y - box.y) * ratio);
  }
  document.body.append(element);
  const hidden = parts.map(({ node }): [Konva.Node, number] => [node, node.opacity()]);
  for (const [node] of hidden) node.opacity(0);
  const grab = { x: pointer.x - tile.left - box.x, y: pointer.y - tile.top - box.y };
  return { element, grab, zoom, hidden };
}

function union(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

function inside(box: DOMRect, p: PagePoint): boolean {
  return p.x >= box.left && p.x < box.right && p.y >= box.top && p.y < box.bottom;
}
