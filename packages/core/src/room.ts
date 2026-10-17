// Where something can go in a free area without covering what already lies there.
import type { Vec2 } from '@trayful/formats/browser';
import { boundsOf, type Bounds } from './layout.js';
import { occupants, toTable, type SnapSpot } from './snap.js';
import type { Catalog, TableState } from './state.js';

/** Space kept between things placed side by side in an area, in millimetres. */
const GAP = 2;

/** What is to go into an area: its size, and the objects that are moving and so do not count. */
export interface Newcomer {
  size: Vec2;
  ignore: ReadonlySet<string>;
}

/**
 * Where something of `size` can go in a free area without overlapping what
 * already lies there: the middle when it is clear, else the first clear place
 * from the top-left corner, left to right, then row by row. The middle again
 * when the area is full.
 */
export function roomIn(
  state: TableState,
  catalog: Catalog,
  area: SnapSpot,
  { size, ignore }: Newcomer,
): Vec2 {
  const taken = occupants(state, area.ref)
    .filter((o) => !ignore.has(o.id))
    .map((o) => boundsOf(state, catalog, [o]));
  const clear = (pos: Vec2) => taken.every((box) => !overlaps(box, boxAround(pos, size)));
  if (clear(area.pos)) return area.pos;
  const [areaWidth, areaHeight] = area.area!;
  const [w, h] = size;
  for (let y = h / 2; y + h / 2 <= areaHeight; y += h + GAP) {
    for (let x = w / 2; x + w / 2 <= areaWidth; x += w + GAP) {
      const pos = roundPos(toTable(area, area.area!, [x, y]));
      if (clear(pos)) return pos;
    }
  }
  return area.pos;
}

function boxAround([x, y]: Vec2, [w, h]: Vec2): Bounds {
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
}

/** Whether two boxes overlap; boxes that only touch do not. */
function overlaps(a: Bounds, b: Bounds): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** A position to a tenth of a millimetre, so things that have settled stay put. */
export function roundPos([x, y]: Vec2): Vec2 {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}
