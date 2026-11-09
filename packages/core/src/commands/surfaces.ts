import { Slug, type Surface, type Vec2 } from '@trayful/formats/browser';
import { boundsOf } from '../table/layout.js';
import { roomOn } from '../placement/room.js';
import { ridersOf } from '../placement/snap.js';
import { CENTRE, objectsOn, surfacesOf } from '../table/surfaces.js';
import { CommandError, type Transaction } from './transaction.js';

/** What a surface can be told: its name, whether it is a seat, and where its tile goes. */
interface SurfaceFields {
  name?: string;
  seat?: boolean;
  /** The surface whose tile it follows; `centre` puts it first after the Centre. */
  after?: string;
}

/** Adds a surface, after the last one or after `after`. */
export function addSurface(tx: Transaction, id: string, fields: SurfaceFields): void {
  if (!Slug.safeParse(id).success)
    throw new CommandError(
      `"${id}" is not a surface id; use lowercase letters, digits and dashes.`,
    );
  if (surfacesOf(tx.current()).some((s) => s.id === id))
    throw new CommandError(`There is already a surface "${id}".`);
  const surface: Surface = { id, name: nameOf(fields.name ?? id) };
  if (fields.seat) surface.seat = true;
  tx.surfaces = placeAfter(tx.surfaces, surface, fields.after);
}

/** Renames a surface, makes it a seat or not, or moves its tile. */
export function editSurface(tx: Transaction, id: string, fields: SurfaceFields): void {
  const old = find(tx, id);
  if (id === CENTRE && (fields.seat !== undefined || fields.after !== undefined))
    throw new CommandError('The Centre can only be renamed.');
  const next: Surface = {
    ...old,
    ...(fields.name === undefined ? {} : { name: nameOf(fields.name) }),
  };
  if (fields.seat === false) {
    delete next.seat;
    delete next.player;
  } else if (fields.seat) next.seat = true;
  const rest = tx.surfaces.filter((s) => s.id !== id);
  if (id === CENTRE) tx.surfaces = [next, ...rest];
  else if (fields.after === undefined)
    tx.surfaces = tx.surfaces.map((s) => (s.id === id ? next : s));
  else tx.surfaces = placeAfter(rest, next, fields.after);
}

/**
 * Removes a surface. Whatever lies on it goes to the surface `to`, keeping its shape;
 * a surface with something on it needs a `to`.
 */
export function removeSurface(tx: Transaction, id: string, to: string | undefined): void {
  if (id === CENTRE) throw new CommandError('The Centre cannot be removed.');
  find(tx, id);
  const there = objectsOn(tx.current(), id);
  if (there.length > 0) {
    if (to === undefined)
      throw new CommandError(`"${id}" has things on it; say which surface they go to with "to".`);
    if (to === id) throw new CommandError('Things cannot go to the surface being removed.');
    moveAll(
      tx,
      there.map((o) => o.id),
      tx.surface(to),
    );
  }
  tx.surfaces = tx.surfaces.filter((s) => s.id !== id);
}

/** Sits a player at a seat, or stands whoever sits there up when `player` is left out. */
export function sit(tx: Transaction, id: string, player: string | undefined): void {
  const seat = find(tx, id);
  if (!seat.seat) throw new CommandError(`"${id}" is not a seat.`);
  if (player !== undefined && !Slug.safeParse(player).success)
    throw new CommandError(`"${player}" does not name a player.`);
  if (player !== undefined && seat.player !== undefined && seat.player !== player)
    throw new CommandError(`"${seat.player}" already sits at "${id}".`);
  const next: Surface = { ...seat };
  if (player === undefined) delete next.player;
  else next.player = player;
  tx.surfaces = tx.surfaces.map((s) => (s.id === id ? next : s));
}

function find(tx: Transaction, id: string): Surface {
  const surface = surfacesOf(tx.current()).find((s) => s.id === id);
  if (!surface) throw new CommandError(`There is no surface "${id}".`);
  return surface;
}

function nameOf(name: string): string {
  const clean = name.trim();
  if (!clean) throw new CommandError('A surface needs a name.');
  return clean;
}

/** `list` with `surface` put after `after`, or at the end; `centre` puts it first. */
function placeAfter(
  list: readonly Surface[],
  surface: Surface,
  after: string | undefined,
): Surface[] {
  const [centre, others] = splitCentre(list);
  if (after === undefined) return [...centre, ...others, surface];
  if (after === CENTRE) return [...centre, surface, ...others];
  const i = others.findIndex((s) => s.id === after);
  if (i < 0) throw new CommandError(`There is no surface "${after}" to put it after.`);
  return [...centre, ...others.slice(0, i + 1), surface, ...others.slice(i + 1)];
}

/** A renamed Centre, if listed, and the other surfaces. */
function splitCentre(list: readonly Surface[]): [Surface[], Surface[]] {
  return [list.filter((s) => s.id === CENTRE), list.filter((s) => s.id !== CENTRE)];
}

/** Moves objects to free room on a surface as one group, keeping their shape. */
function moveAll(tx: Transaction, ids: string[], surface: string): void {
  const riding = new Set(ridersOf(tx.current().objects, ids));
  const objects = ids.map((id) => tx.get(id)).filter((o) => !riding.has(o.id));
  const box = boundsOf(tx.current(), tx.catalog, objects);
  const size: Vec2 = [box.x1 - box.x0, box.y1 - box.y0];
  const target = roomOn(tx.current(), tx.catalog, surface, { size, ignore: new Set(ids) });
  const offset: Vec2 = [target[0] - (box.x0 + box.x1) / 2, target[1] - (box.y0 + box.y1) / 2];
  for (const object of [...objects].sort((a, b) => a.z - b.z)) {
    const pos: Vec2 = [object.pos[0] + offset[0], object.pos[1] + offset[1]];
    tx.relocate(object, pos, object.rot, { snap: object.snap, surface });
  }
}
