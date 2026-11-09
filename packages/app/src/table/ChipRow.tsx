import { surfacesOf } from '@trayful/core';
import type { Surface } from '@trayful/formats/browser';
import { useEffect, useState } from 'react';
import { shownNow, useStore } from '../store';
import { defaultChoice, seatsOf, type Preset } from './surfaces';
import { choosePreset, toggleSurface } from './tiles';

/** How long a chip pulses after something changed on its hidden surface, in milliseconds. */
const PULSE_MS = 2400;

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'All surfaces' },
  { value: 'mine', label: 'Mine + Centre' },
  { value: 'centre', label: 'Centre only' },
];

/**
 * The row under the toolbar on a table with surfaces: a view to pick, and a chip
 * for each surface that switches its tile on or off.
 */
export function ChipRow() {
  const table = useStore((s) => s.table);
  const player = useStore((s) => s.me?.player?.id);
  // Joined, so the row only redraws when what is shown changes.
  const shown = useStore((s) => shownNow({ ...s, focus: undefined }).join('\n'));
  const surfaceChoice = useStore((s) => s.surfaceChoice);
  if (!table) return null;
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
        />
      ))}
    </nav>
  );
}

function Chip({
  surface,
  shown,
  mine,
}: Readonly<{ surface: Surface; shown: boolean; mine: boolean }>) {
  const sitter = useStore((s) => s.players.find((p) => p.id === surface.player)?.name);
  const pulsing = usePulse(surface.id);
  const classes = ['chip', shown && 'on', mine && 'mine', pulsing && !shown && 'pulse'];
  return (
    <button
      type="button"
      className={classes.filter(Boolean).join(' ')}
      aria-pressed={shown}
      title={shown ? `Hide ${surface.name}` : `Show ${surface.name}`}
      onClick={() => toggleSurface(surface.id)}
    >
      {surface.name}
      {sitter && <span className="sitter">{sitter}</span>}
    </button>
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
