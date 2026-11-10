import { surfacesOf } from '@trayful/core';
import type { Surface } from '@trayful/formats/browser';
import { useEffect, useState } from 'react';
import { shownNow, useStore } from '../store';
import { MoreMenu } from '../toolbar/MoreMenu';
import { HAND_DRAG } from './hand';
import { addItems, surfaceItems, type MenuContext } from './surfaceMenu';
import { defaultChoice, seatsOf, surfaceColor, toSurface, type Preset } from './surfaces';
import { choosePreset, toggleSurface } from './tiles';

/** How long a chip pulses after something changed on its hidden surface, in milliseconds. */
const PULSE_MS = 2400;

/** A project without colours. */
const NO_COLORS: Readonly<Record<string, string>> = {};

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'All surfaces' },
  { value: 'mine', label: 'Mine + Centre' },
  { value: 'centre', label: 'Centre only' },
];

/**
 * The row under the toolbar on a table with surfaces: a view to pick, a chip for
 * each surface that switches its tile on or off and takes pieces dropped on it,
 * and menus to change the surfaces.
 */
export function ChipRow() {
  const table = useStore((s) => s.table);
  const player = useStore((s) => s.me?.player?.id);
  // Joined, so the row only redraws when what is shown changes.
  const shown = useStore((s) => shownNow({ ...s, focus: undefined }).join('\n'));
  const surfaceChoice = useStore((s) => s.surfaceChoice);
  const command = useStore((s) => s.command);
  const palette = useStore((s) => s.view?.assets.colors) ?? NO_COLORS;
  if (!table) return null;
  const menu: MenuContext = {
    table,
    player,
    command,
    ask,
    confirm: (q) => window.confirm(q),
    colors: Object.keys(palette),
  };
  const choice = surfaceChoice ?? defaultChoice(table, player);
  const seated = seatsOf(table, player).length > 0;
  const showing = new Set(shown.split('\n'));
  return (
    <nav className="chip-row" aria-label="Surfaces">
      <select
        aria-label="View"
        value={'preset' in choice ? choice.preset : 'custom'}
        onChange={(e) => choosePreset(e.target.value as Preset)}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value} disabled={p.value === 'mine' && !seated}>
            {p.label}
          </option>
        ))}
        <option value="custom" disabled hidden>
          My pick
        </option>
      </select>
      {surfacesOf(table).map((surface) => (
        <Chip
          key={surface.id}
          surface={surface}
          shown={showing.has(surface.id)}
          mine={player !== undefined && surface.player === player}
          color={surfaceColor(surface, palette)}
          menu={menu}
        />
      ))}
      <MoreMenu
        items={addItems(menu)}
        button={{ text: '+', label: 'Add a surface', title: 'Add a surface', fromLeft: true }}
      />
    </nav>
  );
}

function ask(question: string, suggestion?: string): string | undefined {
  return window.prompt(question, suggestion) ?? undefined;
}

/**
 * A surface's chip: the button that switches its tile, and a menu to change the
 * surface. Pieces dragged from a tile, or a card from the hand, can be dropped on it.
 */
function Chip({
  surface,
  shown,
  mine,
  color,
  menu,
}: Readonly<{
  surface: Surface;
  shown: boolean;
  mine: boolean;
  color: string | undefined;
  menu: MenuContext;
}>) {
  const sitter = useStore((s) => s.players.find((p) => p.id === surface.player)?.name);
  const target = useStore((s) => s.dropSurface === surface.id);
  const pulsing = usePulse(surface.id);
  const classes = ['chip', shown && 'on', mine && 'mine', pulsing && !shown && 'pulse'];
  return (
    <span
      className={target ? 'chip-group drop-target' : 'chip-group'}
      data-chip={surface.id}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(HAND_DRAG)) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(HAND_DRAG);
        if (!id) return;
        e.preventDefault();
        menu.command({ type: 'move', ids: [id], to: toSurface(surface.id) });
      }}
    >
      <button
        type="button"
        className={classes.filter(Boolean).join(' ')}
        aria-pressed={shown}
        title={shown ? `Hide ${surface.name}` : `Show ${surface.name}`}
        onClick={() => toggleSurface(surface.id)}
      >
        {color && <span className="swatch" style={{ background: color }} />}
        {surface.name}
        {sitter && <span className="sitter">{sitter}</span>}
      </button>
      <MoreMenu
        items={surfaceItems(surface, menu)}
        button={{
          text: '▾',
          label: `Change ${surface.name}`,
          title: `Change ${surface.name}`,
          fromLeft: true,
        }}
      />
    </span>
  );
}

/** Whether a surface's chip is pulsing now, for a while after something changed there. */
function usePulse(surface: string): boolean {
  const at = useStore((s) => s.pulses[surface]);
  const [pulsing, setPulsing] = useState(false);
  useEffect(() => {
    if (at === undefined) return;
    const left = at + PULSE_MS - Date.now();
    if (left <= 0) return;
    setPulsing(true);
    const timer = setTimeout(() => setPulsing(false), left);
    return () => clearTimeout(timer);
  }, [at]);
  return pulsing;
}
