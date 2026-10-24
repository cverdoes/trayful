import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { examples, scratchLegacyProject, scratchProject } from './testing.js';

const example = path.join(examples, 'harvest-moon');
const notAProject = fileURLToPath(new URL('.', import.meta.url));

async function capture(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    args,
    (s) => out.push(s),
    (s) => err.push(s),
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('trayful validate', () => {
  it('validates the example project', async () => {
    const r = await capture(['validate', example]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('✓ Harvest Moon: 6 types, 26 components, 1 deck, 1 setup');
  });

  it('prints JSON with --json', async () => {
    const r = await capture(['validate', example, '--json']);
    expect(JSON.parse(r.out)).toEqual({ ok: true, diagnostics: [] });
  });

  it('fails on a folder without a project', async () => {
    const r = await capture(['validate', notAProject]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('trayful.yaml  error  File not found.');
    expect(r.err).toContain('1 error in');
    const json = await capture(['validate', notAProject, '--json']);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.out)).toMatchObject({ ok: false });
  });

  it('needs a folder', async () => {
    const r = await capture(['validate', '--json']);
    expect(r.code).toBe(2);
    expect(r.err).toBe(
      'Give the project folder to check.\nUsage: trayful validate <project-dir> [--json]',
    );
  });
});

describe('trayful migrate', () => {
  it('rewrites a project in the first format and lists the files it wrote', async () => {
    const dir = await scratchLegacyProject();
    const r = await capture(['migrate', dir]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      new RegExp(`^Migrated ${dir} to the current file format\\. Wrote:\n {2}library/`),
    );
    expect(r.out).toContain('\n  assets.yaml\n');
    expect(await readFile(path.join(dir, 'trayful.yaml'), 'utf8')).toContain('format: trayful/2');
    expect(JSON.parse((await capture(['validate', dir, '--json'])).out)).toEqual({
      ok: true,
      diagnostics: [],
    });
  });

  it('needs a folder, and says when a project is already current', async () => {
    const usage = await capture(['migrate']);
    expect(usage.code).toBe(2);
    expect(usage.err).toBe(
      'Give the project folder to migrate.\nUsage: trayful migrate <project-dir>',
    );
    const r = await capture(['migrate', await scratchProject()]);
    expect(r.code).toBe(1);
    expect(r.err).toBe('This project is already in trayful/2.');
  });
});

describe('trayful new', () => {
  it('names the game after the folder', async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-new-')), 'moon_base-two');
    const r = await capture(['new', dir]);
    expect(r.code).toBe(0);
    expect(r.out).toBe(`Created "Moon Base Two" in ${dir}. Play it with: trayful play ${dir}`);
    expect(await readFile(path.join(dir, 'trayful.yaml'), 'utf8')).toContain('Moon Base Two');
  });

  it('takes a name, and refuses to overwrite a project', async () => {
    const dir = path.join(await mkdtemp(path.join(os.tmpdir(), 'trayful-new-')), 'game');
    expect((await capture(['new', '--name', 'Space Pigs', dir])).out).toContain('"Space Pigs"');
    const again = await capture(['new', dir]);
    expect(again.code).toBe(1);
    expect(again.err).toBe(`There is already a project in ${dir}.`);
  });

  it('needs a folder, and a name after --name', async () => {
    expect((await capture(['new'])).err).toBe(
      'Give a folder for the new project.\nUsage: trayful new <folder> [--name <name>]',
    );
    const r = await capture(['new', 'game', '--name']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--name needs a name.');
  });
});

describe('trayful skill', () => {
  it('adds the skill to a repository, then brings it up to date', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'trayful-repo-'));
    const dir = path.join(repo, '.claude', 'skills', 'trayful');
    const added = await capture(['skill', repo]);
    expect(added.code).toBe(0);
    expect(added.out).toMatch(/^Added the Trayful skill in .*\.claude\/skills\/trayful\./);
    expect(await readFile(path.join(dir, 'SKILL.md'), 'utf8')).toMatch(/^---\nname: trayful\n/);

    await writeFile(path.join(dir, 'SKILL.md'), 'old');
    await writeFile(path.join(dir, 'notes.md'), 'mine');
    expect((await capture(['skill', repo])).out).toMatch(/^Updated the Trayful skill/);
    expect(await readFile(path.join(dir, 'SKILL.md'), 'utf8')).not.toBe('old');
    expect(await readFile(path.join(dir, 'notes.md'), 'utf8')).toBe('mine');
  });
});

describe('trayful CLI', () => {
  it('rejects bad play and mcp options with the usage', async () => {
    const play = await capture(['play', '--port', 'abc']);
    expect(play.code).toBe(2);
    expect(play.err).toContain('--port needs a whole number.\nUsage: trayful play [project-dir]');
    const mcp = await capture(['mcp', '--frob']);
    expect(mcp.code).toBe(2);
    expect(mcp.err).toContain('Unknown option "--frob".\nUsage: trayful mcp [project-dir]');
  });

  it('shows help and rejects unknown commands', async () => {
    expect((await capture([])).out).toContain('Usage: trayful');
    expect((await capture(['--help'])).code).toBe(0);
    const r = await capture(['frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Unknown command "frobnicate".');
  });
});
