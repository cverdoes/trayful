import {
  areaAccepts,
  dropAreas,
  dropMode,
  holdsMany,
  type ComponentType,
  type DropMode,
  type Vec2,
} from '@trayful/formats/browser';
import {
  onTable,
  sizeOf,
  type Catalog,
  type Piece,
  type TableObject,
  type TableState,
} from './state.js';

/**
 * Containers declare drop areas, made of numbered spots or an area. A spot is
 * written `owner/target/index` and an area `owner/target`, where owner is the id
 * of the piece that declares them.
 */
export interface SnapSpot {
  ref: string;
  owner: string;
  target: string;
  /** Spot number, or undefined for a free area. */
  index?: number;
  /** Centre of the spot (or of the area) on the table. */
  pos: Vec2;
  /** Rotation of the owner, which snapped pieces take on. */
  rot: number;
  /** Component ids or representations allowed here; undefined allows anything. */
  accepts?: string[];
  /** What the spot or area does with what lands in it. */
  mode: DropMode;
  /** Areas only: width and height before rotation. */
  area?: Vec2;
}

/**
 * Just past the right end of a row, `after` places further: what lands there
 * lines up after everything already in the row once it settles.
 */
export function rowEnd(row: SnapSpot, after = 0): Vec2 {
  return toTable(row, [0, 0], [row.area![0] / 2 + 1 + after, 0]);
}

export class SnapError extends Error {}

/** Converts a point in a piece's own coordinates (from its top-left corner, in mm) to the table. */
export function toTable(owner: { pos: Vec2; rot: number }, size: Vec2, local: Vec2): Vec2 {
  const [dx, dy] = [local[0] - size[0] / 2, local[1] - size[1] / 2];
  const r = (owner.rot * Math.PI) / 180;
  return [
    owner.pos[0] + dx * Math.cos(r) - dy * Math.sin(r),
    owner.pos[1] + dx * Math.sin(r) + dy * Math.cos(r),
  ];
}

/** Converts a table point to a piece's own coordinates, measured from its top-left corner. */
export function toLocal(owner: { pos: Vec2; rot: number }, size: Vec2, point: Vec2): Vec2 {
  const [dx, dy] = [point[0] - owner.pos[0], point[1] - owner.pos[1]];
  const r = (-owner.rot * Math.PI) / 180;
  return [
    dx * Math.cos(r) - dy * Math.sin(r) + size[0] / 2,
    dx * Math.sin(r) + dy * Math.cos(r) + size[1] / 2,
  ];
}

/** Every spot and area declared by one piece, placed where the piece lies now. */
export function spotsOf(piece: Piece, type: ComponentType): SnapSpot[] {
  const size = sizeOf(type);
  const spots: SnapSpot[] = [];
  for (const target of dropAreas(type)) {
    const common = {
      owner: piece.id,
      target: target.id,
      rot: piece.rot,
      accepts: target.accepts,
      mode: dropMode(target),
    };
    let locals: Vec2[] = [];
    if (target.grid) {
      const { origin, cols, rows, cell } = target.grid;
      const [cw, ch] = typeof cell === 'number' ? [cell, cell] : cell;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++)
          locals.push([origin[0] + col * cw, origin[1] + row * ch]);
      }
    } else if (target.points) {
      locals = target.points;
    } else if (target.area) {
      const areaSize = sizeOf({ size: target.area.size });
      const centre: Vec2 = [
        target.area.at[0] + areaSize[0] / 2,
        target.area.at[1] + areaSize[1] / 2,
      ];
      spots.push({
        ...common,
        ref: `${piece.id}/${target.id}`,
        pos: toTable(piece, size, centre),
        area: areaSize,
      });
      continue;
    }
    locals.forEach((local, index) =>
      spots.push({
        ...common,
        ref: `${piece.id}/${target.id}/${index}`,
        index,
        pos: toTable(piece, size, local),
      }),
    );
  }
  return spots;
}

/** All snap spots on the table, from pieces lying directly on it. */
export function allSpots(state: TableState, catalog: Catalog): SnapSpot[] {
  const spots: SnapSpot[] = [];
  for (const object of Object.values(state.objects)) {
    if (object.kind !== 'piece' || !onTable(object)) continue;
    const type = catalog[object.type];
    if (type?.container) spots.push(...spotsOf(object, type));
  }
  return spots;
}

/**
 * Resolves `owner/target` (every spot, in order) or `owner/target/index` (one spot).
 * The owner can be a piece id, or a type id when exactly one piece has that type.
 */
export function resolveSpots(state: TableState, catalog: Catalog, ref: string): SnapSpot[] {
  const [ownerRef, targetId, index, ...rest] = ref.split('/');
  if (!ownerRef || !targetId || rest.length > 0) {
    throw new SnapError(`"${ref}" should look like "board/target" or "board/target/index".`);
  }
  const owner = findOwner(state, ownerRef);
  const type = catalog[owner.type];
  const spots = type ? spotsOf(owner, type).filter((s) => s.target === targetId) : [];
  if (spots.length === 0) throw new SnapError(`"${ownerRef}" has no drop area "${targetId}".`);
  if (index === undefined) return spots;
  const spot = spots.find((s) => s.index === Number(index));
  if (!spot) {
    throw new SnapError(
      spots[0]!.area
        ? `"${targetId}" is an area and has no numbered spots.`
        : `Spot ${index} is out of range; "${targetId}" has spots 0 to ${spots.length - 1}.`,
    );
  }
  return [spot];
}

function findOwner(state: TableState, ref: string): Piece {
  const direct = state.objects[ref];
  if (direct?.kind === 'piece') {
    if (direct.parent) throw new SnapError(`"${ref}" is inside a stack.`);
    return direct;
  }
  const ofType = Object.values(state.objects).filter(
    (o): o is Piece => o.kind === 'piece' && o.type === ref && !o.parent,
  );
  if (ofType.length === 1) return ofType[0]!;
  if (ofType.length > 1) {
    throw new SnapError(
      `There are ${ofType.length} "${ref}" pieces; use an id such as "${ofType[0]!.id}".`,
    );
  }
  throw new SnapError(`No piece "${ref}" on the table.`);
}

/** Whether a piece of this kind may snap to the spot. */
export function accepts(spot: SnapSpot, type: ComponentType | undefined): boolean {
  if (!spot.accepts) return true;
  return !!type && areaAccepts(spot, type);
}

/** Objects on the table that sit in a spot. */
export function occupants(state: TableState, ref: string): TableObject[] {
  return Object.values(state.objects).filter((o) => o.snap === ref && onTable(o));
}

/** Whether a table point lies inside an area. */
export function insideArea(spot: SnapSpot, point: Vec2): boolean {
  if (!spot.area) return false;
  const local = toLocal(spot, spot.area, point);
  return local[0] >= 0 && local[1] >= 0 && local[0] <= spot.area[0] && local[1] <= spot.area[1];
}

/** A piece being dropped on the table, for finding the spot it snaps to. */
export interface Drop {
  /** The dropped piece's type; spots that do not accept it are skipped. */
  type: ComponentType | undefined;
  point: Vec2;
  /** How far from `point` a spot may be, in millimetres. */
  radius: number;
  /** Objects being moved, which neither offer spots nor take them up. */
  ignore?: ReadonlySet<string>;
}

/**
 * The spot a drop snaps to: an area it lands in, or else the nearest accepting
 * spot within its radius, preferring free spots.
 */
export function snapFor(
  state: TableState,
  catalog: Catalog,
  { type, point, radius, ignore = new Set() }: Drop,
): SnapSpot | undefined {
  const candidates = allSpots(state, catalog).filter(
    (s) => !ignore.has(s.owner) && accepts(s, type),
  );
  let best: { spot: SnapSpot; score: number } | undefined;
  for (const spot of candidates) {
    if (spot.area) {
      if (insideArea(spot, point) && !best) best = { spot, score: Infinity };
      continue;
    }
    const d = Math.hypot(spot.pos[0] - point[0], spot.pos[1] - point[1]);
    if (d > radius) continue;
    // An occupied spot only wins if no free one is in reach; a pile or group always has room.
    const taken =
      !holdsMany(spot.mode) && occupants(state, spot.ref).some((o) => !ignore.has(o.id));
    const score = d + (taken ? radius * 2 : 0);
    if (!best || score < best.score) best = { spot, score };
  }
  return best?.spot;
}

/** The piece id a `snap` reference belongs to. */
export function snapOwner(snap: string): string {
  return snap.split('/')[0]!;
}

/**
 * Objects that ride along with the given owners: everything snapped to them,
 * and everything snapped to those in turn. The owners themselves are not included.
 */
export function ridersOf(
  objects: Readonly<Record<string, TableObject>>,
  owners: Iterable<string>,
): string[] {
  const carried = new Set(owners);
  const riders: string[] = [];
  const all = Object.values(objects).filter((o) => o.snap && onTable(o));
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of all) {
      if (!carried.has(object.id) && carried.has(snapOwner(object.snap!))) {
        carried.add(object.id);
        riders.push(object.id);
        grew = true;
      }
    }
  }
  return riders;
}
