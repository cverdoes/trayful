import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adoptPlayers, markBase, resolveBase, otherFilesIn } from '../../src/projects/base.js';
import { createProjectFolder } from '../../src/projects/workspace.js';

/** A base folder with one project, `game`, in it. */
async function scratchBase(): Promise<string> {
  const base = await mkdtemp(path.join(os.tmpdir(), 'trayful-base-'));
  await createProjectFolder(path.join(base, 'game'), 'Game');
  return base;
}

describe('resolveBase', () => {
  it('takes a folder of projects as it is', async () => {
    const base = await scratchBase();
    expect(resolveBase(base)).toEqual({ base, project: undefined });
    expect(resolveBase(base, 'game')).toEqual({ base, project: 'game' });
  });

  it('takes a project folder as short for the folder it is in, opening on it', async () => {
    const base = await scratchBase();
    expect(resolveBase(path.join(base, 'game'))).toEqual({ base, project: 'game' });
    expect(resolveBase(path.join(base, 'game'), 'game')).toEqual({ base, project: 'game' });
  });

  it('refuses another --project for a project folder, and the top of the disk', async () => {
    const base = await scratchBase();
    expect(() => resolveBase(path.join(base, 'game'), 'other')).toThrow(/is the project "game"/);
    expect(() => resolveBase(path.parse(base).root)).toThrow(/top of the disk/);
  });
});

describe('a base folder', () => {
  it('counts what else is in it until Trayful has served it', async () => {
    const base = await scratchBase();
    expect(await otherFilesIn(base)).toBe(0);
    await writeFile(path.join(base, 'notes.md'), '');
    await mkdir(path.join(base, 'art'));
    await writeFile(path.join(base, '.hidden'), '');
    expect(await otherFilesIn(base)).toBe(2);
    await markBase(base);
    expect(await otherFilesIn(base)).toBe(0);
  });

  it('is marked with a folder that keeps itself out of git', async () => {
    const base = await scratchBase();
    await markBase(base);
    await markBase(base);
    expect(await readFile(path.join(base, '.trayful', '.gitignore'), 'utf8')).toBe('*\n');
  });

  it('takes the players from a project served on its own, unless it has its own', async () => {
    const base = await scratchBase();
    expect(await adoptPlayers(base, 'game')).toBeUndefined();
    const old = path.join(base, 'game', '.trayful', 'players.json');
    await mkdir(path.dirname(old), { recursive: true });
    await writeFile(old, '{"invites":[],"players":[]}');
    expect(await adoptPlayers(base, 'game')).toMatch(/^Moved the players/);
    expect(existsSync(path.join(base, '.trayful', 'players.json'))).toBe(true);
    await mkdir(path.dirname(old), { recursive: true });
    await writeFile(old, '{}');
    expect(await adoptPlayers(base, 'game')).toMatch(/no longer read/);
    expect(existsSync(old)).toBe(true);
  });
});
