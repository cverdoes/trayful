// What a viewer can change about the table's surfaces from the chip row.
import { CENTRE, surfacesOf, type Command, type TableState } from '@trayful/core';
import type { Surface } from '@trayful/formats/browser';
import type { MenuItem } from '../toolbar/MoreMenu';
import type { Confirmation, Question } from '../ui/dialogs';

/** What a menu on the chip row needs: the table, who is looking, and how to act. */
export interface MenuContext {
  table: Pick<TableState, 'surfaces'>;
  /** The viewer's player id, when they have joined. */
  player?: string;
  command: (command: Command) => void;
  /** Asks for a line of text, and gives it trimmed, or nothing when the person backs out. */
  ask: (question: Question) => Promise<string | undefined>;
  confirm: (question: Confirmation) => Promise<boolean>;
  /** The names of the project's colours, offered when colouring a surface. */
  colors?: readonly string[];
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
  const add = (seat: boolean) => async () => {
    const name = await ctx.ask({
      title: seat ? 'Add a seat' : 'Add a surface',
      text: seat
        ? 'A play space for one player to sit at.'
        : 'A separate play space everyone shares.',
      label: 'Name',
      action: 'Add',
    });
    if (!name) return;
    const id = surfaceId(name, ctx.table);
    ctx.command({ type: 'addSurface', id, name, ...(seat ? { seat: true } : {}) });
  };
  return [
    {
      label: 'Add a surface…',
      title: 'A separate play space everyone shares',
      onSelect: () => void add(false)(),
    },
    {
      label: 'Add a seat…',
      title: 'A play space for one player to sit at',
      onSelect: () => void add(true)(),
    },
  ];
}

/**
 * The choices for one surface: sitting down or standing up at a seat, renaming and
 * colouring it, making it a seat or not, and removing it. The Centre can only be
 * renamed and coloured.
 */
export function surfaceItems(surface: Surface, ctx: MenuContext): MenuItem[] {
  const { id, name } = surface;
  const rename: MenuItem = {
    label: 'Rename…',
    onSelect: () =>
      void ctx
        .ask({ title: `Rename "${name}"`, label: 'New name', value: name, action: 'Rename' })
        .then((next) => {
          if (next && next !== name) ctx.command({ type: 'editSurface', id, name: next });
        }),
  };
  if (id === CENTRE) return [rename, colorItem(surface, ctx)];
  return [
    ...seatItems(surface, ctx),
    { ...rename, separated: surface.seat === true && ctx.player !== undefined },
    colorItem(surface, ctx),
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
      onSelect: () =>
        void ctx
          .confirm({
            title: `Remove "${name}"?`,
            text: 'What lies on it moves to the Centre. You can undo this.',
            action: 'Remove',
            danger: true,
          })
          .then((yes) => {
            if (yes) ctx.command({ type: 'removeSurface', id, to: CENTRE });
          }),
    },
  ];
}

/** Colouring a surface's tile frame and chip, or taking the colour off. */
function colorItem({ id, name, color }: Surface, ctx: MenuContext): MenuItem {
  return {
    label: 'Colour…',
    title: 'Tints its tile frame and chip',
    onSelect: () => {
      const names = ctx.colors?.length ? `a colour such as ${ctx.colors.join(', ')}, or ` : '';
      void ctx
        .ask({
          title: `Colour for "${name}"`,
          text: `Type ${names}a CSS colour such as #c5523a. Leave it empty for none.`,
          label: 'Colour',
          value: color,
          action: 'Set colour',
          allowEmpty: true,
        })
        .then((next) => {
          if (next !== undefined && next !== (color ?? '')) {
            ctx.command({ type: 'editSurface', id, color: next });
          }
        });
    },
  };
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
