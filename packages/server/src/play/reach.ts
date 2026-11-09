import {
  CommandError,
  HAND_PREFIX,
  HIDDEN_PREFIX,
  isHidden,
  PromptError,
  resolveSpots,
  SnapError,
  surfacesOf,
  type Aliases,
  type Catalog,
  type PlayerPrompt,
  type PromptRequest,
  type TableState,
} from '@trayful/core';
import type { PlayerDirectory } from './players.js';

/**
 * Throws when a command names a piece out of the player's reach, or an unknown player.
 * Pieces in other players' hands are out of reach; stand-in ids must be swapped for
 * real ones first.
 */
export function checkReach(
  state: TableState,
  players: PlayerDirectory | undefined,
  value: unknown,
  player: string | undefined,
): void {
  if (typeof value === 'string') checkReference(state, players, value, player);
  else if (Array.isArray(value)) for (const v of value) checkReach(state, players, v, player);
  else if (value && typeof value === 'object') {
    // Text written on a sheet is only text: it names no piece.
    for (const [key, v] of Object.entries(value)) {
      if (key !== 'text') checkReach(state, players, v, player);
    }
  }
}

/** Checks one string in a command, which may name a piece, a snap spot or a hand. */
function checkReference(
  state: TableState,
  players: PlayerDirectory | undefined,
  value: string,
  player: string | undefined,
): void {
  const id = value.split('/')[0]!;
  if (id.startsWith(HIDDEN_PREFIX)) {
    throw new CommandError(
      'That hidden piece is no longer where you saw it (it was shuffled or moved). Look at the table again.',
    );
  }
  const object = state.objects[id];
  if (object?.kind === 'piece' && object.hand && object.hand !== player) {
    throw new CommandError("That piece is in another player's hand.");
  }
  const owner = value.startsWith(HAND_PREFIX) ? value.slice(HAND_PREFIX.length) : undefined;
  if (owner !== undefined && players && !players.get(owner)) {
    throw new CommandError(`There is no player "${owner}".`);
  }
}

/**
 * Throws when a `sit` command seats or unseats someone it may not: the host and
 * agents seat anyone, while others only sit down or stand up themselves.
 */
export function checkSeating(
  state: TableState,
  players: PlayerDirectory | undefined,
  value: unknown,
  player: string | undefined,
): void {
  if (!isSit(value)) return;
  const command = value;
  if (command.player !== undefined && players && !players.get(command.player))
    throw new CommandError(`There is no player "${command.player}".`);
  const role = player === undefined ? 'host' : players?.get(player)?.role;
  if (role === 'host' || role === 'agent') return;
  const seated = surfacesOf(state).find((s) => s.id === command.surface)?.player;
  // Standing up an empty seat touches nobody, so it counts as the player's own.
  const self = command.player ?? seated ?? player;
  if (self !== player) throw new CommandError('Only the host can seat or unseat someone else.');
}

function isSit(value: unknown): value is { type: 'sit'; surface: string; player?: string } {
  return !!value && typeof value === 'object' && (value as { type?: unknown }).type === 'sit';
}

/** Every piece or place a prompt names: what may be picked, what it points at, what glows. */
function namedIn(request: PromptRequest): string[] {
  return [
    ...(request.candidates ?? []),
    ...(request.anchor ? [request.anchor] : []),
    ...(request.highlight ?? []),
  ];
}

/**
 * Throws when a prompt names a piece or place that one of its players cannot see: a
 * piece in someone else's hand or in a bag, or a drop area that does not exist. A
 * face-down piece is fine: each player is shown its stand-in id.
 */
export function checkPromptReach(
  state: TableState,
  catalog: Catalog,
  request: PromptRequest,
  to: readonly string[],
): void {
  for (const name of namedIn(request)) {
    if (name.includes('/')) checkPlace(state, catalog, name);
    else for (const player of to) checkPiece(state, name, player);
  }
  if (request.kind === 'place' && request.candidates?.some((c) => !c.includes('/'))) {
    throw new PromptError('A place prompt picks drop areas or spots, such as `board/market/2`.');
  }
}

function checkPlace(state: TableState, catalog: Catalog, place: string): void {
  try {
    resolveSpots(state, catalog, place);
  } catch (err) {
    if (err instanceof SnapError) throw new PromptError(err.message);
    throw err;
  }
}

function checkPiece(state: TableState, id: string, player: string): void {
  const object = state.objects[id];
  if (!object) throw new PromptError(`There is no piece "${id}" on the table.`);
  if (object.kind !== 'piece') return;
  if (object.bag) throw new PromptError(`"${id}" is in a bag, where nobody can see it.`);
  if (object.hand && object.hand !== player) {
    throw new PromptError(`"${id}" is in another player's hand, so ${player} cannot see it.`);
  }
}

/**
 * A prompt as one player is shown it: pieces hidden from them, such as face-down cards,
 * go by the stand-in ids their view of the table uses, so no real id gives them away.
 */
export function promptAsSeenBy(
  prompt: PlayerPrompt,
  state: TableState,
  viewer: string,
  aliases: Aliases,
): PlayerPrompt {
  const own = (name: string) => {
    const object = state.objects[name];
    return object?.kind === 'piece' && isHidden(object, viewer) ? aliases.alias(name) : name;
  };
  return {
    ...prompt,
    ...(prompt.candidates ? { candidates: prompt.candidates.map(own) } : {}),
    ...(prompt.anchor ? { anchor: own(prompt.anchor) } : {}),
    ...(prompt.highlight ? { highlight: prompt.highlight.map(own) } : {}),
  };
}
