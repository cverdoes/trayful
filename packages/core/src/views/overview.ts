// The opening lines of a table description: its surfaces, and how much lies where.
import { boundsOf } from '../table/layout.js';
import type { Catalog, TableState } from '../table/state.js';
import { CENTRE, objectsOn, surfacesOf } from '../table/surfaces.js';

/** An object being described: its id, and its surface when not the Centre. */
interface Placed {
  id: string;
  surface?: string;
}

/**
 * The surfaces a table has, with who sits where and how much lies on each, when it
 * has more than the Centre; or the one surface being described.
 */
export function surfaceLines(state: TableState, only: string | undefined): string[] {
  const all = surfacesOf(state);
  if (all.length === 1 && only === undefined) return [];
  const listed = only === undefined ? all : all.filter((s) => s.id === only);
  if (listed.length === 0) throw new Error(`There is no surface "${only}".`);
  return [
    'Surfaces (separate play spaces with their own positions; everyone sees them all; give "surface" with a position, or "surface:<id>" as "to" for free room there):',
    ...listed.map((s) => {
      const parts = [`- ${s.id}: ${s.name}`];
      if (s.seat) parts.push(s.player ? `seat, ${s.player} sits here` : 'seat, empty');
      parts.push(`${objectsOn(state, s.id).length} objects`);
      return parts.join(', ');
    }),
  ];
}

/** How many objects there are, the area each surface's cover, and where there is room. */
export function overviewLines(
  state: TableState,
  catalog: Catalog,
  summaries: Placed[],
  only: string | undefined,
): string[] {
  const ids = [...new Set(summaries.map((s) => s.surface ?? CENTRE))];
  const box = (on: Placed[]) =>
    boundsOf(
      state,
      catalog,
      on.map((s) => state.objects[s.id]!),
    );
  if (only === undefined && surfacesOf(state).length === 1) {
    const { x0, y0, x1, y1 } = box(summaries);
    return [
      `Table "${state.table}": ${summaries.length} objects, covering x ${num(x0)} to ${num(x1)} ` +
        `and y ${num(y0)} to ${num(y1)} mm. Positions are centres in mm; y grows downwards.`,
      `Free space: anywhere below y ${num(y1)} or right of x ${num(x1)}.`,
      '',
    ];
  }
  const lines = [
    `Table "${state.table}": ${summaries.length} objects. Positions are centres in mm on each surface; y grows downwards.`,
  ];
  for (const id of ids) {
    const on = summaries.filter((s) => (s.surface ?? CENTRE) === id);
    const { x0, y0, x1, y1 } = box(on);
    lines.push(
      `On ${id}: ${on.length} objects covering x ${num(x0)} to ${num(x1)} and y ${num(y0)} to ${num(y1)}; ` +
        `free space anywhere below y ${num(y1)} or right of x ${num(x1)}.`,
    );
  }
  return [...lines, ''];
}

function num(n: number): string {
  return String(Math.round(n * 10) / 10);
}
