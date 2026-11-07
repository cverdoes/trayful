import type { PlayerInfo } from '@trayful/core';
import { AGENT_PLAYER, type PlayerDirectory } from './players.js';

/** An agent counts as at the table this long after it last acted. */
const AGENT_ONLINE_MS = 5 * 60_000;

/** People first, then agents and engines; by name within each. */
const ORDER = { host: 0, guest: 1, agent: 2, engine: 3 };

/**
 * Who is at a table, from the ids of everyone watching it, holding pieces there or who
 * has acted there. `seen` is when each last acted; an agent with no connection of its
 * own counts as there for a while after.
 */
export function rosterOf(
  ids: Iterable<string | undefined>,
  watching: ReadonlySet<string | undefined>,
  seen: ReadonlyMap<string, number>,
  players: PlayerDirectory | undefined,
): PlayerInfo[] {
  const now = Date.now();
  const infos: PlayerInfo[] = [];
  for (const id of new Set(ids)) {
    if (!id) continue;
    const player = players?.get(id) ?? {
      id,
      name: id,
      color: '#6c757d',
      kind: id === AGENT_PLAYER ? 'agent' : 'person',
      role: id === AGENT_PLAYER ? 'agent' : 'guest',
    };
    const online =
      watching.has(id) || (player.kind === 'agent' && now - (seen.get(id) ?? 0) < AGENT_ONLINE_MS);
    infos.push({ ...player, online });
  }
  return infos.sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
}
