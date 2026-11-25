import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { inside } from '../../src/projects/authoring.js';

describe('inside', () => {
  let project: string;
  let elsewhere: string;

  beforeEach(async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'trayful-inside-'));
    project = path.join(root, 'game');
    elsewhere = path.join(root, 'elsewhere');
    await mkdir(path.join(project, 'images'), { recursive: true });
    await mkdir(elsewhere);
    await writeFile(path.join(elsewhere, 'secret.png'), 'x');
  });

  it('resolves files in the project, existing or not', () => {
    expect(inside(project, 'images/a.png')).toBe(path.join(project, 'images', 'a.png'));
    expect(inside(project, 'new/folder/b.png')).toBe(path.join(project, 'new', 'folder', 'b.png'));
  });

  it('refuses a path that climbs out', () => {
    expect(() => inside(project, '../elsewhere/secret.png')).toThrow(/outside the project/);
  });

  it('refuses a symbolic link that leads out of the project', async () => {
    await symlink(elsewhere, path.join(project, 'link'));
    expect(() => inside(project, 'link/secret.png')).toThrow(/outside the project/);
    expect(() => inside(project, 'link/new.png')).toThrow(/outside the project/);
  });

  it('refuses a symbolic link that leads nowhere', async () => {
    await symlink(path.join(elsewhere, 'missing.png'), path.join(project, 'dangling.png'));
    expect(() => inside(project, 'dangling.png')).toThrow(/outside the project/);
  });

  it('allows a symbolic link that stays in the project', async () => {
    await symlink(path.join(project, 'images'), path.join(project, 'pictures'));
    expect(inside(project, 'pictures/a.png')).toBe(path.join(project, 'pictures', 'a.png'));
  });
});
