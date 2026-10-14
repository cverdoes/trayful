import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_PLAYER, FilePlayerStore, MemoryPlayerStore, Players } from './players.js';

describe('Players', () => {
  it('gives each player a unique id and a secret only they know', async () => {
    const players = await Players.open(new MemoryPlayerStore());
    expect(players.get(AGENT_PLAYER)).toMatchObject({ name: 'Claude', kind: 'agent' });
    const a = await players.join('  Åsa   Öberg ', 'guest');
    const b = await players.join('Åsa Öberg', 'guest');
    const c = await players.join('Claude', 'guest');
    expect([a.player.id, b.player.id, c.player.id]).toEqual([
      'asa-oberg',
      'asa-oberg-2',
      'claude-2',
    ]);
    expect(a.player.name).toBe('Åsa Öberg');
    expect(players.authenticate('asa-oberg', a.secret)).toEqual(a.player);
    expect(players.authenticate('asa-oberg', b.secret)).toBeUndefined();
    expect(players.authenticate(AGENT_PLAYER, '')).toBeUndefined();
    await expect(players.join('   ', 'guest')).rejects.toThrow(/name/);
  });

  it('makes one host, and keeps players and the invite between runs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'trayful-players-'));
    const store = FilePlayerStore.in(root);
    const first = await Players.open(store);
    const [h1, h2] = await Promise.all([first.host(), first.host()]);
    expect(h1).toEqual(h2);
    const { secret } = await first.join('Bob', 'guest');

    const again = await Players.open(store);
    expect(again.invite).toBe(first.invite);
    expect(again.authenticate('bob', secret)?.name).toBe('Bob');
    expect((await again.host()).id).toBe(h1.id);
    expect(await readFile(store.file, 'utf8')).not.toContain(secret);
    if (process.platform !== 'win32') expect((await stat(store.file)).mode & 0o077).toBe(0);
  });
});
