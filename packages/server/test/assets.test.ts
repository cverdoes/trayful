import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { addImage, removeImage, setColor, setImage } from './assets.js';
import { Workspace } from './workspace.js';

const starter = fileURLToPath(new URL('../../../examples/starter', import.meta.url));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"/>').toString(
  'base64',
);

let workspace: Workspace | undefined;
afterEach(async () => {
  await workspace?.close();
  workspace = undefined;
});

async function open(): Promise<{ ws: Workspace; dir: string }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-assets-'));
  await cp(starter, dir, { recursive: true });
  workspace = await Workspace.open(dir, { watch: false });
  return { ws: workspace, dir };
}

const assetsText = (dir: string) => readFile(path.join(dir, 'assets.yaml'), 'utf8');

describe('the assets file', () => {
  it('names a new image after its file, cut into tiles, keeping the file as written', async () => {
    const { ws, dir } = await open();
    const id = ws.active.projectId;
    expect(await addImage(ws, id, { file: 'assets/d6.svg', base64: SVG, cols: 6 })).toEqual({
      name: 'd6',
      file: 'assets/d6.svg',
    });
    // The same file name again goes under a new path and a new name.
    expect(await addImage(ws, id, { file: 'assets/d6.svg', base64: SVG })).toEqual({
      name: 'd6-2',
      file: 'assets/d6-2.svg',
    });
    const text = await assetsText(dir);
    expect(text).toContain('# yaml-language-server');
    expect(text).toContain('  d6: { file: assets/d6.svg, cols: 6 }\n');
    expect(text).toContain('  d6-2: assets/d6-2.svg\n');
    expect(ws.project(id).assets.images.d6).toEqual({ file: 'assets/d6.svg', rows: 1, cols: 6 });
  });

  it('changes the tiles of an image, and takes the name off one no component uses', async () => {
    const { ws, dir } = await open();
    const id = ws.active.projectId;
    await setImage(ws, id, 'card-back', { file: 'assets/card-back.svg', rows: 2, cols: 3 });
    expect(ws.project(id).assets.images['card-back']).toMatchObject({ rows: 2, cols: 3 });
    await setImage(ws, id, 'card-back', { file: 'assets/card-back.svg' });
    expect(await assetsText(dir)).toContain('  card-back: assets/card-back.svg\n');

    // The starter's cards use card-back, so it stays.
    await expect(removeImage(ws, id, 'card-back')).rejects.toThrow(/break the project/);
    await addImage(ws, id, { file: 'spare.svg', base64: SVG });
    await removeImage(ws, id, 'spare');
    expect(ws.project(id).assets.images.spare).toBeUndefined();
    // The file stays: other things may use it.
    expect(existsSync(path.join(dir, 'spare.svg'))).toBe(true);
    await expect(removeImage(ws, id, 'nothing')).rejects.toThrow('No image is called "nothing".');
  });

  it('names, changes and removes colours', async () => {
    const { ws, dir } = await open();
    const id = ws.active.projectId;
    await setColor(ws, id, 'sea', '#2266aa');
    expect(ws.project(id).assets.colors.sea).toBe('#2266aa');
    await setColor(ws, id, 'sea', undefined);
    expect(ws.project(id).assets.colors.sea).toBeUndefined();
    expect(await assetsText(dir)).not.toContain('sea');
    await expect(setColor(ws, id, 'Sea Blue', '#fff')).rejects.toThrow(/not a usable name/);
  });

  it('makes the assets file when the project has none', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-assets-'));
    const manifest =
      'name: Bare\nformat: trayful/2\nlibraries: [library/*.yaml]\ninventory: inventory.yaml\n';
    await writeFile(path.join(dir, 'trayful.yaml'), manifest);
    await writeFile(path.join(dir, 'inventory.yaml'), 'kind: inventory\ncomponents: []\n');
    await mkdir(path.join(dir, 'library'));
    await writeFile(path.join(dir, 'library', 'pieces.yaml'), 'kind: library\ncomponents: []\n');
    workspace = await Workspace.open(dir, { watch: false });
    await setColor(workspace, workspace.active.projectId, 'sea', '#2266aa');
    expect(await assetsText(dir)).toBe("kind: assets\ncolors:\n  sea: '#2266aa'\n");
  });
});
