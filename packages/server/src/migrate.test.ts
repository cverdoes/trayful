import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadProject, type ResolvedProject } from '@trayful/formats';
import { afterEach, describe, expect, it } from 'vitest';
import { removeType, setInventory, upsertType } from './authoring.js';
import { createMcpServer } from './mcp.js';
import { migrateFolder, MigrateError } from './migrate.js';
import { renameField, renameType } from './renaming.js';
import { Workspace } from './workspace.js';

const legacy = fileURLToPath(
  new URL('../../formats/fixtures/legacy-harvest-moon', import.meta.url),
);
const current = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

/** A copy of a project folder to change. */
async function copy(source: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-migrate-'));
  await cp(source, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return dir;
}

const read = (dir: string, file: string) => readFile(path.join(dir, file), 'utf8');

async function load(dir: string): Promise<ResolvedProject> {
  const { project, diagnostics } = await loadProject(dir);
  if (!project) throw new Error(`${dir} does not load: ${JSON.stringify(diagnostics)}`);
  return project;
}

/** The components of a project as the table sees them, without where they are written. */
function components(project: ResolvedProject) {
  return Object.values(project.types).map(({ source: _source, ...type }) => type);
}

describe('migrating a project', () => {
  it('rewrites it in the current format, so it loads the same and without warnings', async () => {
    const dir = await copy(legacy);
    const before = await loadProject(dir);
    expect(before.diagnostics.map((d) => d.severity)).toEqual(['warning']);

    const files = await migrateFolder(dir);
    expect(files.toSorted()).toEqual(
      [
        'assets.yaml',
        'inventory.yaml',
        'library/cards.yaml',
        'library/pieces.yaml',
        'setups/2-player.yaml',
        'trayful.yaml',
      ].sort(),
    );
    const after = await loadProject(dir);
    expect(after.diagnostics).toEqual([]);
    const old = before.project!;
    const now = after.project!;
    expect(now.legacy).toBe(false);
    expect(now.components).toEqual(old.components);
    expect(now.decks).toEqual(old.decks);
    expect(now.setups).toEqual(old.setups);
    expect(now.assets).toEqual(old.assets);
    expect(components(now)).toEqual(components(old));
  });

  it('writes the assets file with an editor hint, and keeps the comments people wrote', async () => {
    const dir = await copy(legacy);
    const comment = '# The cards of the market.\n';
    const inventory = await read(dir, 'inventory.yaml');
    await writeFile(
      path.join(dir, 'inventory.yaml'),
      inventory.replace('  - type: action-card\n', `  ${comment}  - type: action-card\n`),
    );
    const manifest = await read(dir, 'trayful.yaml');
    await writeFile(
      path.join(dir, 'trayful.yaml'),
      manifest.replace('units: mm\n', 'units: mm # all sizes\n'),
    );

    await migrateFolder(dir);
    const assets = await read(dir, 'assets.yaml');
    expect(assets).toMatch(
      /^# yaml-language-server: \$schema=\.\.\/\.\.\/packages\/formats\/schema\/assets\.schema\.json\nkind: assets\n/,
    );
    expect(assets).toContain('card-back: assets/card-back.svg');
    const newManifest = await read(dir, 'trayful.yaml');
    expect(newManifest).toContain('format: trayful/2\n');
    expect(newManifest).toContain('units: mm # all sizes\n');
    expect(newManifest).toContain('assets: assets.yaml\n');
    const newInventory = await read(dir, 'inventory.yaml');
    expect(newInventory).toContain(`  ${comment}  - component: action-card\n`);
    expect(newInventory).not.toContain('type:');
    expect(await read(dir, 'library/pieces.yaml')).toMatch(
      /^# yaml-language-server: .*library\.schema\.json\nkind: library\ncomponents:\n/,
    );
  });

  it('locks the board the setups place, as boards were locked before', async () => {
    const dir = await copy(legacy);
    await migrateFolder(dir);
    expect(await read(dir, 'setups/2-player.yaml')).toContain(
      '  - place: main-board\n    at: [0, 0]\n    lock: true\n',
    );
    expect((await load(dir)).setups['2-player']!.steps[0]).toMatchObject({ lock: true });
  });

  it('names its assets file assets-2.yaml when the project already has an assets.yaml', async () => {
    const dir = await copy(legacy);
    await writeFile(path.join(dir, 'assets.yaml'), 'not mine\n');
    expect(await migrateFolder(dir)).toContain('assets-2.yaml');
    expect(await read(dir, 'assets.yaml')).toBe('not mine\n');
    expect((await load(dir)).manifest.assets).toBe('assets-2.yaml');
  });

  it('rewrites libraries that define no types, moving their palette to the assets file', async () => {
    const dir = await copy(legacy);
    await writeFile(
      path.join(dir, 'library', 'colours.yaml'),
      "kind: library\npalette:\n  sky: '#88ccee'\ntypes: []\n",
    );
    expect(await migrateFolder(dir)).toContain('library/colours.yaml');
    const project = await load(dir);
    expect(project.assets.colors.sky).toBe('#88ccee');
    expect(await read(dir, 'library/colours.yaml')).toBe('kind: library\ncomponents: []\n');
  });

  it('refuses a project already in the current format', async () => {
    const dir = await copy(current);
    const manifest = await read(dir, 'trayful.yaml');
    await expect(migrateFolder(dir)).rejects.toThrow(MigrateError);
    await expect(migrateFolder(dir)).rejects.toThrow('This project is already in trayful/2.');
    expect(await read(dir, 'trayful.yaml')).toBe(manifest);
  });

  it('refuses a project in no format it knows', async () => {
    const dir = await copy(legacy);
    const manifest = await read(dir, 'trayful.yaml');
    await writeFile(path.join(dir, 'trayful.yaml'), manifest.replace('trayful/1', 'trayful/0'));
    await expect(migrateFolder(dir)).rejects.toThrow(/not in trayful\/1, so there is nothing/);
  });

  it('refuses a legacy project with errors, and changes nothing', async () => {
    const dir = await copy(legacy);
    const inventory = (await read(dir, 'inventory.yaml')).replace(
      '  - type: coins\n',
      '  - type: lantern\n',
    );
    await writeFile(path.join(dir, 'inventory.yaml'), inventory);
    const error = await migrateFolder(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrateError);
    expect((error as Error).message).toMatch(/^Fix these problems first:\n {2}inventory\.yaml/);
    expect((error as Error).message).toContain('lantern');
    expect(await read(dir, 'inventory.yaml')).toBe(inventory);
  });
});

describe('a project in the first format', () => {
  let workspace: Workspace | undefined;
  afterEach(async () => {
    await workspace?.close();
    workspace = undefined;
  });

  async function open(): Promise<Workspace> {
    workspace = await Workspace.open(await copy(legacy), { seed: 1, watch: false });
    return workspace;
  }

  it('plays, but refuses changes to its components until it is migrated', async () => {
    const ws = await open();
    const id = ws.active.projectId;
    expect(ws.active.view().legacy).toBe(true);
    expect(ws.active.view().assets.images['card-back']).toBeDefined();
    const coin = { id: 'coin', is: 'piece', size: 20 };
    const refusals = [
      upsertType(ws, id, coin),
      removeType(ws, id, 'coins'),
      setInventory(ws, id, 'coins', []),
      renameType(ws, id, 'worker', 'farmer'),
      renameField(ws, id, 'worker', { from: 'color', to: 'colour' }),
    ];
    for (const refusal of refusals) await expect(refusal).rejects.toThrow(/Migrate it first/);

    await migrateFolder(ws.entry(id).dir);
    expect(await ws.reload(id)).toEqual([]);
    expect(ws.active.view().legacy).toBe(false);
    expect((await upsertType(ws, id, coin)).created).toBe(true);
  });

  it('is migrated by the migrate_project tool', async () => {
    const ws = await open();
    const [a, b] = InMemoryTransport.createLinkedPair();
    await createMcpServer(ws).connect(a);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(b);
    const call = async () =>
      (await client.callTool({ name: 'migrate_project', arguments: {} })) as {
        content: { text: string }[];
        isError?: boolean;
      };

    const migrated = await call();
    expect(migrated.isError).toBeFalsy();
    expect(migrated.content[0]!.text).toMatch(/^Rewrote .*assets\.yaml.* in the current format\./);
    expect(ws.project().legacy).toBe(false);
    const again = await call();
    expect(again).toMatchObject({
      isError: true,
      content: [{ text: 'This project is already in trayful/2.' }],
    });
    await client.close();
  });
});
