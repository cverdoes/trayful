import type { TableState } from '@trayful/core';
import { describe, expect, it } from 'vitest';
import type { Player, PlayerDirectory } from '../../src/play/players.js';
import { checkSeating } from '../../src/play/reach.js';

const player = (id: string, role: Player['role']): Player => ({
  id,
  name: id,
  color: '#000',
  kind: role === 'agent' ? 'agent' : 'person',
  role,
});
const people: Record<string, Player> = {
  host: player('host', 'host'),
  ann: player('ann', 'guest'),
  bo: player('bo', 'guest'),
  claude: player('claude', 'agent'),
};
const players: PlayerDirectory = { get: (id) => people[id] };
const table: TableState = {
  format: 'trayful/1',
  table: 't',
  seed: 1,
  rng: 1,
  surfaces: [
    { id: 'red', name: 'Red', seat: true, player: 'bo' },
    { id: 'blue', name: 'Blue', seat: true },
  ],
  objects: {},
};
const check = (command: object, by: string | undefined) => () =>
  checkSeating(table, players, { type: 'sit', ...command }, by);

describe('who may seat whom', () => {
  it('lets a guest sit down and stand up themselves', () => {
    expect(check({ surface: 'blue', player: 'ann' }, 'ann')).not.toThrow();
    expect(check({ surface: 'red' }, 'bo')).not.toThrow();
  });

  it('lets the host and agents seat and unseat anyone', () => {
    expect(check({ surface: 'blue', player: 'ann' }, 'host')).not.toThrow();
    expect(check({ surface: 'red' }, 'claude')).not.toThrow();
    expect(check({ surface: 'red' }, undefined)).not.toThrow();
  });

  it('stops a guest seating or unseating someone else', () => {
    expect(check({ surface: 'blue', player: 'bo' }, 'ann')).toThrow('Only the host');
    expect(check({ surface: 'red' }, 'ann')).toThrow('Only the host');
  });

  it('refuses a player nobody knows, and ignores other commands', () => {
    expect(check({ surface: 'blue', player: 'zed' }, 'host')).toThrow('no player "zed"');
    expect(() => checkSeating(table, players, { type: 'flip', ids: [] }, 'ann')).not.toThrow();
  });
});
