import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { designsTable, importCsv, moveToCsv, readTray, saveTray } from '../../src/projects/tray.js';
import { Workspace } from '../../src/projects/workspace.js';
import { examplePath } from '../paths.js';

const starter = examplePath('starter');

let workspace: Workspace | undefined;
afterEach(async () => {
  await workspace?.close();
  workspace = undefined;
});

async function open(): Promise<{ ws: Workspace; dir: string; id: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-tray-'));
  await cp(starter, dir, { recursive: true });
  workspace = await Workspace.open(dir, { watch: false });
  return { ws: workspace, dir, id: workspace.active.projectId };
}

const count = (ws: Workspace, id: string, type: string) =>
  ws.project(id).components.filter((c) => c.type === type).length;

describe('the Tray', () => {
  it("reads a component's entries with the CSV files they read", async () => {
    const { ws, id } = await open();
    const tray = await readTray(ws, id, 'card');
    expect(tray.entries).toEqual([{ deck: 'cards', from: 'data/cards.csv' }]);
    expect(tray.tables['data/cards.csv']!.header).toContain('title');
    expect((await readTray(ws, id, 'token')).entries).toEqual([
      { each: { color: ['blue', 'orange'] }, count: 3 },
    ]);
  });

  it('saves entries and edited CSV cells together', async () => {
    const { ws, id, dir } = await open();
    const tray = await readTray(ws, id, 'card');
    const table = tray.tables['data/cards.csv']!;
    const title = table.header.indexOf('title');
    table.rows[0]![title] = 'Renamed, with a comma';
    const saved = await saveTray(ws, id, 'card', {
      entries: [...tray.entries, { items: [{ title: 'Extra' }], count: 2 }],
      tables: tray.tables,
    });
    expect(saved.entries).toHaveLength(2);
    expect(await readFile(path.join(dir, 'data/cards.csv'), 'utf8')).toContain(
      '"Renamed, with a comma"',
    );
    // The CSV's counts add up to 6 cards, and the new row makes 2 more.
    expect(count(ws, id, 'card')).toBe(8);
  });

  it('refuses entries that break the project, and leaves the files as they were', async () => {
    const { ws, id, dir } = await open();
    const before = await readFile(path.join(dir, 'inventory.yaml'), 'utf8');
    await expect(
      saveTray(ws, id, 'token', { entries: [{ items: [{ color: 'green' }] }], tables: {} }),
    ).rejects.toThrow(/break the project/);
    await expect(
      saveTray(ws, id, 'token', {
        entries: [],
        tables: { 'data/cards.csv': { header: [], rows: [] } },
      }),
    ).rejects.toThrow(/not a CSV file of "token"/);
    expect(await readFile(path.join(dir, 'inventory.yaml'), 'utf8')).toBe(before);
  });

  it('imports a CSV file into the data folder as a new entry', async () => {
    const { ws, id } = await open();
    const tray = await importCsv(ws, id, 'token', {
      name: 'More Tokens.csv',
      text: 'color,count\nblue,2\norange,1\n',
    });
    expect(tray.entries.at(-1)).toEqual({ from: 'data/more-tokens.csv' });
    expect(tray.tables['data/more-tokens.csv']!.rows).toEqual([
      ['blue', '2'],
      ['orange', '1'],
    ]);
    expect(count(ws, id, 'token')).toBe(6 + 3);
  });

  it('moves designs typed into an entry to a CSV file the entry then reads', async () => {
    const { ws, id, dir } = await open();
    const tray = await readTray(ws, id, 'card');
    const typed = {
      deck: 'extras',
      count: 2,
      data: { value: 1 },
      items: [{ title: 'Rest, then go' }, { title: 'Feast', value: 5, count: 3 }],
    };
    await saveTray(ws, id, 'card', { entries: [...tray.entries, typed], tables: tray.tables });
    const before = count(ws, id, 'card');

    const moved = await moveToCsv(ws, id, 'card', 1);
    expect(moved.entries[1]).toEqual({ deck: 'extras', count: 2, from: 'data/extras.csv' });
    const text = await readFile(path.join(dir, 'data/extras.csv'), 'utf8');
    expect(text.split('\n')[0]).toMatch(/^title,.*value.*,count$/);
    expect(text).toContain('"Rest, then go"');
    // The same designs and copies are in the box as before.
    expect(count(ws, id, 'card')).toBe(before);
  });

  it('moves only designs typed into the Tray to a CSV file', async () => {
    const { ws, id } = await open();
    await expect(moveToCsv(ws, id, 'card', 0)).rejects.toThrow(/Only designs typed/);
    await expect(moveToCsv(ws, id, 'token', 0)).rejects.toThrow(/Only designs typed/);
    await expect(moveToCsv(ws, id, 'token', 7)).rejects.toThrow(/Only designs typed/);
  });

  it('writes designs as a table with a column per field, then per other value', () => {
    expect(designsTable(['name', 'cost'], [{ cost: 2, count: 3 }, { name: 'Raid' }])).toEqual({
      header: ['name', 'cost', 'count'],
      rows: [
        ['', '2', '3'],
        ['Raid', '', ''],
      ],
    });
  });
});
