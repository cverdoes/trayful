// What a viewer can change about the table's surfaces from the chip row.
import { CENTRE, surfacesOf, type Command, type TableState } from '@trayful/core';
import type { Surface } from '@trayful/formats/browser';
import type { MenuItem } from '../toolbar/MoreMenu';

/** Asks a question and gives the answer, or nothing when the person backs out. */
type Ask = (question: string, suggestion?: string) => string | undefined;

/** What a menu on the chip row needs: the table, who is looking, and how to act. */
export interface MenuContext {
  table: Pick<TableState, 'surfaces'>;
  /** The viewer's player id, when they have joined. */
  player?: string;
  command: (command: Command) => void;
  ask: Ask;
  confirm: (question: string) => boolean;
}

/** A surface id made from a name, not yet taken on the table: "Red player" gives `red-player`. */
export function surfaceId(name: string, table: Pick<TableState, 'surfaces'>): string {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const base = words.join('-') || 'surface';
  const taken = new Set(surfacesOf(table).map((s) => s.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The choices for adding a surface: a shared one, or a seat a player sits at. */
export function addItems(ctx: MenuContext): MenuItem[] {
  const add = (seat: boolean) => () => {
    const name = ctx.ask(seat ? 'Name of the new seat:' : 'Name of the new surface:')?.trim();
    if (!name) return;
    const id = surfaceId(name, ctx.table);
    ctx.command({ type: 'addSurface', id, name, ...(seat ? { seat: true } : {}) });
  };
  return [
    {
      label: 'Add a surface…',
      title: 'A separate play space everyone shares',
      onSelect: add(false),
    },
    { label: 'Add a seat…', title: 'A play space for one player to sit at', onSelect: add(true) },
  ];
}

/**
 * The choices for one surface: sitting down or standing up at a seat, renaming it,
 * making it a seat or not, and removing it. The Centre can only be renamed.
 */
export function surfaceItems(surface: Surface, ctx: MenuContext): MenuItem[] {
  const { id, name } = surface;
  const rename: MenuItem = {
    label: 'Rename…',
    onSelect: () => {
      const next = ctx.ask(`New name for "${name}":`, name)?.trim();
      if (next && next !== name) ctx.command({ type: 'editSurface', id, name: next });
    },
  };
  if (id === CENTRE) return [rename];
  return [
    ...seatItems(surface, ctx),
    { ...rename, separated: surface.seat === true && ctx.player !== undefined },
    surface.seat
      ? {
          label: 'No longer a seat',
          title: 'Anyone sitting here stands up',
          onSelect: () => ctx.command({ type: 'editSurface', id, seat: false }),
        }
      : {
          label: 'Make it a seat',
          title: 'A player can sit here; it is then theirs in "Mine + Centre"',
          onSelect: () => ctx.command({ type: 'editSurface', id, seat: true }),
        },
    {
      label: 'Remove…',
      title: 'What lies on it moves to the Centre',
      onSelect: () => {
        if (
          ctx.confirm(`Remove "${name}"? What lies on it moves to the Centre. You can undo this.`)
        )
          ctx.command({ type: 'removeSurface', id, to: CENTRE });
      },
    },
  ];
}

/** Sitting down at a seat, or standing up from it, for a viewer who has joined. */
function seatItems(surface: Surface, { player, command }: MenuContext): MenuItem[] {
  if (!surface.seat || player === undefined) return [];
  return surface.player === player
    ? [{ label: 'Stand up', onSelect: () => command({ type: 'sit', surface: surface.id }) }]
    : [
        {
          label: 'Sit here',
          onSelect: () => command({ type: 'sit', surface: surface.id, player }),
        },
      ];
}
