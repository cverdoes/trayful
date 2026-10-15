import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerMessage, Stack } from '@trayful/core';
import type { ResolvedType } from '@trayful/formats';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAsset,
  AuthoringError,
  ConflictError,
  libraryFiles,
  removeType,
  setInventory,
  upsertType,
} from './authoring.js';
import { createProjectFolder, Workspace } from './workspace.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

/** A folder holding a copy of the example and a project made from the starter. */
async function scratchWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trayful-ws-'));
  await cp(example, path.join(root, 'harvest-moon'), {
    recursive: true,
    filter: (src) => path.basename(src) !== 'tables',
  });
  await createProjectFolder(path.join(root, 'starter-game'), 'Starter Game');
  return root;
}

let workspace: Workspace | undefined;
afterEach(async () => {
  await workspace?.close();
  workspace = undefined;
});

async function open(options: Parameters<typeof Workspace.open>[1] = {}) {
  const root = await scratchWorkspace();
  workspace = await Workspace.open(root, { seed: 1, watch: false, ...options });
  return workspace;
}

/** A loaded type as its library file writes it, without what the loader adds. */
function asWritten(type: ResolvedType) {
  return Object.fromEntries(
    Object.entries(type).filter(([key]) => key !== 'source' && key !== 'normalizedFields'),
  );
}

describe('Workspace', () => {
  it('serves a folder of projects and opens the first one', async () => {
    const ws = await open();
    expect(ws.single).toBe(false);
    expect(ws.projects().map((p) => p.id)).toEqual(['harvest-moon', 'starter-game']);
    expect(ws.active.projectId).toBe('harvest-moon');
    expect(ws.project('starter-game').manifest.name).toBe('Starter Game');
  });

  it('serves one project folder', async () => {
    const root = await scratchWorkspace();
    workspace = await Workspace.open(path.join(root, 'starter-game'), { watch: false });
    expect(workspace.single).toBe(true);
    await expect(workspace.createProject('More')).rejects.toThrow(/folder of projects/);
  });

  it('refuses an empty folder and unknown projects', async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), 'trayful-empty-'));
    await expect(Workspace.open(empty, { watch: false })).rejects.toThrow(/trayful new/);
    const ws = await open();
    expect(() => ws.entry('nope')).toThrow(/No project "nope"/);
  });

  it('creates, duplicates and deletes tables', async () => {
    const ws = await open({ project: 'starter-game' });
    const first = ws.active;
    first.engine.dispatch({ type: 'shuffle', id: 'deck:cards' });
    const copy = await ws.duplicateTable('starter-game', 'table-1', 'branch');
    expect(copy.engine.state.objects).toEqual(first.engine.state.objects);
    expect(copy.engine.state.table).toBe('branch');
    expect(await ws.tables('starter-game')).toEqual(['branch', 'table-1']);

    await expect(ws.duplicateTable('starter-game', 'table-1', 'branch')).rejects.toThrow(
      /already has/,
    );
    await expect(ws.deleteTable('starter-game', 'table-1')).rejects.toThrow(/open another/);
    await ws.deleteTable('starter-game', 'branch');
    expect(await ws.tables('starter-game')).toEqual(['table-1']);
    await expect(ws.table('starter-game', 'missing', { create: false })).rejects.toThrow(
      /no table/,
    );
    await expect(ws.table('starter-game', 'Bad Name')).rejects.toThrow();
  });

  it('creates projects from the starter', async () => {
    const ws = await open();
    const entry = await ws.createProject('Moon Market');
    expect(entry.id).toBe('moon-market');
    expect(entry.problems).toEqual([]);
    expect(entry.project?.manifest.name).toBe('Moon Market');
    expect(existsSync(path.join(entry.dir, 'README.md'))).toBe(false);
    const library = await readFile(path.join(entry.dir, 'library', 'cards.yaml'), 'utf8');
    expect(library).toMatch(/\$schema=\.\.\/.*packages\/formats\/schema\/library\.schema\.json/);
    await expect(ws.createProject('Moon Market')).rejects.toThrow(/already/);
  });

  it('reloads changed files into open tables as one undoable step', async () => {
    const ws = await open({ project: 'starter-game' });
    const session = ws.active;
    const messages: ServerMessage[] = [];
    session.subscribe((m) => messages.push(m));
    const csv = path.join(ws.entry().dir, 'data', 'cards.csv');
    const before = (session.engine.state.objects['deck:cards'] as Stack).items.length;
    await writeFile(csv, (await readFile(csv, 'utf8')) + 'Extra,One more card,4,1\n');

    expect(await ws.reload('starter-game')).toEqual([]);
    expect(ws.entry().version).toBe(2);
    expect((session.engine.state.objects['deck:cards'] as Stack).items).toHaveLength(before + 1);
    expect(messages.map((m) => m.type)).toContain('project');
    session.engine.undo();
    expect((session.engine.state.objects['deck:cards'] as Stack).items).toHaveLength(before);
  });

  it('keeps the last good project when files break, and reports the problems', async () => {
    const ws = await open({ project: 'starter-game' });
    const messages: ServerMessage[] = [];
    ws.active.subscribe((m) => messages.push(m));
    await writeFile(
      path.join(ws.entry().dir, 'inventory.yaml'),
      'kind: inventory\ncomponents: 3\n',
    );
    const problems = await ws.reload('starter-game');
    expect(problems[0]).toMatch(/inventory\.yaml/);
    expect(ws.project('starter-game').components.length).toBeGreaterThan(0);
    expect(messages.at(-1)).toMatchObject({ type: 'problems' });
  });
});

describe('watching', () => {
  it('reloads a project when its files are saved', async () => {
    const ws = await open({ project: 'starter-game', watch: true });
    const reloaded = new Promise((resolve) => ws.onReload(resolve));
    const manifest = path.join(ws.entry().dir, 'trayful.yaml');
    const text = await readFile(manifest, 'utf8');
    await writeFile(manifest, text.replace(/^name: .*$/m, 'name: Renamed'));
    await reloaded;
    expect(ws.active.project.manifest.name).toBe('Renamed');
  });
});

describe('authoring', () => {
  it('adds a type next to its kind, keeping comments', async () => {
    const ws = await open({ project: 'starter-game' });
    const result = await upsertType(ws, 'starter-game', {
      id: 'event-card',
      base: 'card',
      size: [63, 88],
      fields: { title: 'string' },
      front: { fill: '#ffffff', layers: [{ text: '{{title}}', at: [5, 5] }] },
    });
    expect(result).toMatchObject({ file: 'library/cards.yaml', created: true });
    const text = await readFile(path.join(ws.entry().dir, 'library', 'cards.yaml'), 'utf8');
    expect(text).toMatch(/^# yaml-language-server/);
    expect(text).toContain('id: event-card');
    expect(ws.active.project.types['event-card']).toBeDefined();

    const updated = await upsertType(ws, 'starter-game', {
      id: 'event-card',
      base: 'card',
      size: [70, 120],
      fields: { title: 'string' },
    });
    expect(updated.created).toBe(false);
    expect(ws.project('starter-game').types['event-card']!.size).toEqual([70, 120]);
  });

  it('changes a type in place, so the rest of its file stays as written', async () => {
    const ws = await open({ project: 'harvest-moon' });
    const file = path.join(ws.entry().dir, 'library', 'cards.yaml');
    const before = await readFile(file, 'utf8');
    const card = ws.project('harvest-moon').types['action-card']!;
    await upsertType(ws, 'harvest-moon', { ...asWritten(card), corner: 4 });
    expect(await readFile(file, 'utf8')).toBe(before.replace('corner: 3', 'corner: 4'));
  });

  it('refuses a change made against an older version of the file', async () => {
    const ws = await open({ project: 'starter-game' });
    const { files, types } = await libraryFiles(ws, 'starter-game');
    expect(types.card).toBe('library/cards.yaml');
    const baseHash = files['library/cards.yaml'];
    const card = asWritten(ws.project('starter-game').types.card!);
    await upsertType(ws, 'starter-game', { ...card, corner: 1 }, { baseHash });
    await expect(
      upsertType(ws, 'starter-game', { ...card, corner: 2 }, { baseHash }),
    ).rejects.toThrow(ConflictError);
    const { files: now } = await libraryFiles(ws, 'starter-game');
    await upsertType(
      ws,
      'starter-game',
      { ...card, corner: 2 },
      { baseHash: now['library/cards.yaml'] },
    );
    expect(ws.project('starter-game').types.card!.corner).toBe(2);
  });

  it('lets only one of two changes made at once against the same version through', async () => {
    const ws = await open({ project: 'starter-game' });
    const baseHash = (await libraryFiles(ws, 'starter-game')).files['library/cards.yaml'];
    const card = asWritten(ws.project('starter-game').types.card!);
    const results = await Promise.allSettled([
      upsertType(ws, 'starter-game', { ...card, corner: 1 }, { baseHash }),
      upsertType(ws, 'starter-game', { ...card, corner: 2 }, { baseHash }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    const first = results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof upsertType>>>;
    // The version handed back is the one written, ready for the next change.
    expect(first.value.library).toEqual(await libraryFiles(ws, 'starter-game'));
    expect(ws.project('starter-game').types.card!.corner).toBe(1);
  });

  it('refuses invalid types and changes that break the project', async () => {
    const ws = await open({ project: 'starter-game' });
    await expect(upsertType(ws, 'starter-game', { id: 'x', base: 'spaceship' })).rejects.toThrow(
      AuthoringError,
    );
    const file = path.join(ws.entry().dir, 'library', 'cards.yaml');
    const before = await readFile(file, 'utf8');
    // The inventory gives cards a title; a card type without that field breaks it.
    await expect(
      upsertType(ws, 'starter-game', { id: 'card', base: 'card', size: [63, 88], fields: {} }),
    ).rejects.toThrow(/would break the project/);
    expect(await readFile(file, 'utf8')).toBe(before);
    expect(ws.entry().problems).toEqual([]);
    await expect(
      upsertType(
        ws,
        'starter-game',
        { id: 'y', base: 'card', size: 10 },
        { file: '../outside.yaml' },
      ),
    ).rejects.toThrow(/outside the project/);
  });

  it('sets inventory entries and removes unused types', async () => {
    const ws = await open({ project: 'starter-game' });
    await expect(removeType(ws, 'starter-game', 'token')).rejects.toThrow(/out of the inventory/);
    const result = await setInventory(ws, 'starter-game', 'token', [
      { count: 2, each: { color: ['blue', 'orange'] } },
    ]);
    expect(result.count).toBe(4);
    expect(
      Object.values(ws.active.engine.state.objects).filter(
        (o) => o.kind === 'piece' && o.type === 'token',
      ),
    ).toHaveLength(4);

    await setInventory(ws, 'starter-game', 'token', []);
    // The setup still places tokens, so removing the type is undone.
    await expect(removeType(ws, 'starter-game', 'token')).rejects.toThrow(/start\.yaml/);
    expect(ws.project('starter-game').types.token).toBeDefined();
    await upsertType(ws, 'starter-game', { id: 'spare', base: 'token', size: 10 });
    await removeType(ws, 'starter-game', 'spare');
    expect(ws.project('starter-game').types.spare).toBeUndefined();
    await expect(setInventory(ws, 'starter-game', 'card', [{ count: 'many' }])).rejects.toThrow(
      /inventory entry 1/,
    );
  });

  it('adds image and data files', async () => {
    const ws = await open({ project: 'starter-game' });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
    expect(await addAsset(ws, 'starter-game', 'assets/icon.svg', { text: svg })).toEqual({
      file: 'assets/icon.svg',
      bytes: svg.length,
    });
    await expect(addAsset(ws, 'starter-game', 'notes.txt', { text: 'x' })).rejects.toThrow(
      /Assets must/,
    );
    await expect(addAsset(ws, 'starter-game', '../x.svg', { text: svg })).rejects.toThrow(
      /outside/,
    );
  });
});

describe('opening tables', () => {
  it('opens a table once when asked for it twice at the same time', async () => {
    const ws = await open();
    const [a, b] = await Promise.all([
      ws.table('starter-game', 'table-1'),
      ws.table('starter-game', 'table-1'),
    ]);
    expect(a).toBe(b);
  });
});
