// Which of a table's surfaces this viewer shows as tiles, and where each tile goes.
import { CENTRE, surfaceOf, surfacesOf, SURFACE_PREFIX, type TableState } from '@trayful/core';

/** The views a viewer can pick from the chip row's menu. */
export type Preset = 'all' | 'mine' | 'centre';

/**
 * What this viewer chose to see: a preset, which follows the table as surfaces come
 * and go and players sit down, or the surfaces they switched off one by one.
 */
export type SurfaceChoice = { preset: Preset } | { hidden: string[] };

/** Height of the toolbar along the top of the page, in pixels. */
export const TOOLBAR_HEIGHT = 56;
/** Height of the row of surface chips under the toolbar, in pixels. */
export const CHIP_ROW_HEIGHT = 40;
/** Height of the name along the top of a tile, in pixels. */
const LABEL_HEIGHT = 24;
/** Space between tiles, in pixels. */
const GAP = 8;
/** The Centre's share of the width (or height) when it shares the canvas with others. */
const CENTRE_SHARE = 0.62;

/** A rectangle on the page, in pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One surface's place on the page. */
export interface Tile {
  surface: string;
  /** Where its canvas is. */
  box: Box;
  /** The part of the canvas nothing covers, which fitting fills. */
  clear: Box;
}

/** The target that sends pieces to free room on a surface. */
export function toSurface(surface: string): string {
  return `${SURFACE_PREFIX}${surface}`;
}

/**
 * The surfaces the selected objects can be sent to: every surface but the one
 * they all lie on. None on a table without surfaces, or when nothing selected
 * may move.
 */
export function sendTargets(
  table: TableState,
  selection: readonly string[],
): { ids: string[]; to: { id: string; name: string }[] } {
  const movable = selection
    .map((id) => table.objects[id])
    .filter((o) => o !== undefined && !o.locked);
  if (movable.length === 0 || !hasSurfaces(table)) return { ids: [], to: [] };
  const from = new Set(movable.map((o) => surfaceOf(o!)));
  const to = surfacesOf(table).filter((s) => from.size > 1 || !from.has(s.id));
  return { ids: movable.map((o) => o!.id), to: to.map(({ id, name }) => ({ id, name })) };
}

/** Whether a table has surfaces besides the Centre, and so shows chips and tiles. */
export function hasSurfaces(table: Pick<TableState, 'surfaces'>): boolean {
  return surfacesOf(table).length > 1;
}

/** The surfaces a player sits at. */
export function seatsOf(table: Pick<TableState, 'surfaces'>, player: string | undefined): string[] {
  return surfacesOf(table)
    .filter((s) => player !== undefined && s.player === player)
    .map((s) => s.id);
}

/** Where a viewer starts: their own surfaces and the Centre when they sit somewhere, else all. */
export function defaultChoice(
  table: Pick<TableState, 'surfaces'>,
  player: string | undefined,
): SurfaceChoice {
  return { preset: seatsOf(table, player).length > 0 ? 'mine' : 'all' };
}

/**
 * The surfaces to show as tiles, in tile order. A focused surface shows alone. A
 * choice that would show nothing shows the Centre, so the table never goes blank.
 */
export function shownSurfaces(
  table: Pick<TableState, 'surfaces'>,
  choice: SurfaceChoice,
  player: string | undefined,
  focus?: string,
): string[] {
  const ids = surfacesOf(table).map((s) => s.id);
  if (focus && ids.includes(focus)) return [focus];
  const mine = new Set(seatsOf(table, player));
  const shown = ids.filter((id) => {
    if ('hidden' in choice) return !choice.hidden.includes(id);
    if (choice.preset === 'centre') return id === CENTRE;
    return choice.preset === 'all' || id === CENTRE || mine.has(id);
  });
  return shown.length > 0 ? shown : [CENTRE];
}

/** The choice after switching one surface on or off. */
export function toggled(
  table: Pick<TableState, 'surfaces'>,
  choice: SurfaceChoice,
  player: string | undefined,
  surface: string,
): SurfaceChoice {
  const shown = new Set(shownSurfaces(table, choice, player));
  if (shown.has(surface)) shown.delete(surface);
  else shown.add(surface);
  return {
    hidden: surfacesOf(table)
      .map((s) => s.id)
      .filter((id) => !shown.has(id)),
  };
}

/**
 * Where each shown surface goes on a page that big, above a hand tray that tall.
 * A table without surfaces is one tile filling the page, under the toolbar and over
 * the hand tray as before; with surfaces, the tiles share the room under the chips.
 */
export function tilesFor(
  table: Pick<TableState, 'surfaces'>,
  shown: string[],
  page: { width: number; height: number; hand: number },
): Tile[] {
  const { width, height, hand } = page;
  if (!hasSurfaces(table)) {
    const box = { x: 0, y: 0, width, height };
    return [
      {
        surface: CENTRE,
        box,
        clear: { ...box, y: TOOLBAR_HEIGHT, height: height - TOOLBAR_HEIGHT - hand },
      },
    ];
  }
  const top = TOOLBAR_HEIGHT + CHIP_ROW_HEIGHT;
  const area = {
    x: GAP,
    y: top,
    width: Math.max(0, width - 2 * GAP),
    height: Math.max(0, height - top - hand - GAP),
  };
  return tileLayout(shown, area).map(({ surface, box }) => ({
    surface,
    box,
    clear: { ...box, y: box.y + LABEL_HEIGHT, height: Math.max(0, box.height - LABEL_HEIGHT) },
  }));
}

/**
 * Lays tiles out in `area`. One tile fills it. With the Centre and others, the
 * Centre takes the larger share on the left, or on top in a tall window, and the
 * others share the rest. Without the Centre, all share the area evenly.
 */
export function tileLayout(surfaces: string[], area: Box): { surface: string; box: Box }[] {
  if (surfaces.length === 1) return [{ surface: surfaces[0]!, box: area }];
  const wide = area.width >= area.height;
  if (surfaces[0] !== CENTRE) return split(surfaces, area, wide);
  const [main, rest] = cut(area, wide, CENTRE_SHARE);
  return [{ surface: CENTRE, box: main }, ...split(surfaces.slice(1), rest, !wide)];
}

/** Splits a box into two along its long side, the first part taking `share`. */
function cut(box: Box, wide: boolean, share: number): [Box, Box] {
  if (wide) {
    const first = Math.round((box.width - GAP) * share);
    return [
      { ...box, width: first },
      { ...box, x: box.x + first + GAP, width: box.width - first - GAP },
    ];
  }
  const first = Math.round((box.height - GAP) * share);
  return [
    { ...box, height: first },
    { ...box, y: box.y + first + GAP, height: box.height - first - GAP },
  ];
}

/** Equal tiles side by side (`across`) or one above the other. */
function split(surfaces: string[], box: Box, across: boolean): { surface: string; box: Box }[] {
  const n = surfaces.length;
  const size = ((across ? box.width : box.height) - GAP * (n - 1)) / n;
  return surfaces.map((surface, i) => {
    const offset = Math.round(i * (size + GAP));
    const length = Math.round(size);
    return {
      surface,
      box: across
        ? { ...box, x: box.x + offset, width: length }
        : { ...box, y: box.y + offset, height: length },
    };
  });
}

/** The surfaces where something was added, changed or taken away between two tables. */
export function changedSurfaces(before: TableState, after: TableState): Set<string> {
  const changed = new Set<string>();
  for (const [id, object] of Object.entries(after.objects)) {
    const old = before.objects[id];
    if (old === object || JSON.stringify(old) === JSON.stringify(object)) continue;
    changed.add(surfaceOf(object));
    if (old) changed.add(surfaceOf(old));
  }
  for (const [id, old] of Object.entries(before.objects))
    if (!after.objects[id]) changed.add(surfaceOf(old));
  return changed;
}

const STORAGE_PREFIX = 'trayful.surfaces:';

/** The choice this browser made for a table last time, if any. */
export function loadChoice(key: string): SurfaceChoice | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) ?? 'null') as unknown;
    return isChoice(saved) ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function saveChoice(key: string, choice: SurfaceChoice): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(choice));
  } catch {
    // Without storage the choice lasts until the page is reloaded.
  }
}

function isChoice(value: unknown): value is SurfaceChoice {
  if (!value || typeof value !== 'object') return false;
  const v = value as { preset?: unknown; hidden?: unknown };
  if (Array.isArray(v.hidden)) return v.hidden.every((h) => typeof h === 'string');
  return v.preset === 'all' || v.preset === 'mine' || v.preset === 'centre';
}
