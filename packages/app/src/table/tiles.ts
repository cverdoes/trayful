// What a viewer does with the tiles: picking a view, switching surfaces on and off, focusing one.
import { surfacesOf } from '@trayful/core';
import { choiceKey, shownNow, useStore } from '../store';
import { defaultChoice, saveChoice, toggled, type Preset, type SurfaceChoice } from './surfaces';

/** Shows what a choice says, leaving any focus, and keeps it for this table in this browser. */
function choose(choice: SurfaceChoice): void {
  const { table } = useStore.getState();
  useStore.setState({ surfaceChoice: choice, focus: undefined });
  if (table) saveChoice(choiceKey(table.table), choice);
}

export function choosePreset(preset: Preset): void {
  choose({ preset });
}

/** Switches one surface's tile on or off. */
export function toggleSurface(surface: string): void {
  const { table, me, surfaceChoice } = useStore.getState();
  if (!table) return;
  const player = me?.player?.id;
  choose(toggled(table, surfaceChoice ?? defaultChoice(table, player), player, surface));
}

/**
 * The surface a point on the page is over: its tile, with where that is on the
 * page, or its chip in the row.
 */
export function surfaceUnder(
  clientX: number,
  clientY: number,
): { surface: string; tile?: DOMRect } | undefined {
  const under = document.elementFromPoint(clientX, clientY);
  const chip = under?.closest<HTMLElement>('[data-chip]')?.dataset.chip;
  if (chip) return { surface: chip };
  const tile = under?.closest<HTMLElement>('[data-surface]');
  const surface = tile?.dataset.surface;
  return tile && surface ? { surface, tile: tile.getBoundingClientRect() } : undefined;
}

/** Enlarges a surface to the whole canvas, or goes back to the tiles when it already is. */
export function toggleFocus(surface: string): void {
  useStore.setState((s) => ({ focus: s.focus === surface ? undefined : surface }));
}

/**
 * Number keys focus the tile in that place, counting the shown surfaces (or, while
 * one is focused, those that were shown before). Returns whether there was one.
 */
export function focusNumber(n: number): boolean {
  const s = useStore.getState();
  if (!s.table || surfacesOf(s.table).length < 2) return false;
  const surface = shownNow({ ...s, focus: undefined })[n - 1];
  if (!surface) return false;
  toggleFocus(surface);
  return true;
}
