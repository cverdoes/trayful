// Surfaces: separate play spaces on one table, each with its own positions.
import { CENTRE, type Surface } from '@trayful/formats/browser';
import { onTable, type TableObject, type TableState } from './state.js';

export { CENTRE };

/** The Centre as a table has it before anyone renames it. */
const DEFAULT_CENTRE: Surface = { id: CENTRE, name: 'Centre' };

/** `surface:<id>` names somewhere free on a surface as a target. */
export const SURFACE_PREFIX = 'surface:';

/** The surface a `surface:<id>` target names, or undefined for any other target. */
export function surfaceTarget(target: unknown): string | undefined {
  return typeof target === 'string' && target.startsWith(SURFACE_PREFIX)
    ? target.slice(SURFACE_PREFIX.length)
    : undefined;
}

/** The surface an object lies on; pieces in a stack, a hand or a bag are on none. */
export function surfaceOf(object: TableObject): string {
  return object.surface ?? CENTRE;
}

/** Every surface of a table in tile order, the Centre first, whether or not it is listed. */
export function surfacesOf(state: Pick<TableState, 'surfaces'>): Surface[] {
  const listed = state.surfaces ?? [];
  const centre = listed.find((s) => s.id === CENTRE) ?? DEFAULT_CENTRE;
  return [centre, ...listed.filter((s) => s.id !== CENTRE)];
}

/** Whether a table has a surface with this id; the Centre always counts. */
export function hasSurface(state: Pick<TableState, 'surfaces'>, id: string): boolean {
  return id === CENTRE || (state.surfaces ?? []).some((s) => s.id === id);
}

/** The objects lying directly on one surface. */
export function objectsOn(state: TableState, surface: string): TableObject[] {
  return Object.values(state.objects).filter((o) => onTable(o) && surfaceOf(o) === surface);
}
