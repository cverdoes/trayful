// The base folder a workspace serves: the folder whose sub-folders are its projects.
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MANIFEST_FILE } from '@trayful/formats';
import { ProjectLoadError } from '../play/session.js';

/** Where Trayful keeps its own files in a base folder, such as the players. */
const TRAYFUL_DIR = '.trayful';

/** The base folder to serve, and the project to open first if one was named. */
export interface BaseFolder {
  base: string;
  project?: string;
}

/** Whether `dir` is a project folder: one with a `trayful.yaml`. */
export function isProjectFolder(dir: string): boolean {
  return existsSync(path.join(dir, MANIFEST_FILE));
}

/**
 * The base folder for a folder given on the command line. A project folder is short
 * for the folder it is in, opening on that project, so `trayful play my-game` serves
 * the folder that holds `my-game`, and New project puts the next game beside it.
 */
export function resolveBase(dir: string, project?: string): BaseFolder {
  const folder = path.resolve(dir);
  if (!isProjectFolder(folder)) return { base: checkedBase(folder), project };
  const own = path.basename(folder);
  if (project !== undefined && project !== own) {
    throw new ProjectLoadError(
      `${folder} is the project "${own}", not "${project}". Give the folder that holds your projects to pick one with --project.`,
    );
  }
  return { base: checkedBase(path.dirname(folder)), project: own };
}

function checkedBase(base: string): string {
  if (path.dirname(base) === base) {
    throw new ProjectLoadError(
      `Trayful keeps projects in a folder that holds them, and ${base} is the top of the disk. Put the project in a folder of its own and start Trayful there.`,
    );
  }
  return base;
}

/** The project folders in a base folder, by path. */
export async function projectDirs(base: string): Promise<string[]> {
  const entries = await readdir(base, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(base, e.name))
    .filter(isProjectFolder);
}

/**
 * How many files and folders besides projects a base folder holds, if Trayful has
 * not served it before. A start on a busy folder, such as the home folder, should be
 * a choice: Trayful lists its projects and keeps its own files there.
 */
export async function otherFilesIn(base: string): Promise<number> {
  if (existsSync(path.join(base, TRAYFUL_DIR))) return 0;
  const entries = await readdir(base, { withFileTypes: true });
  return entries.filter(
    (e) =>
      !e.name.startsWith('.') && !(e.isDirectory() && isProjectFolder(path.join(base, e.name))),
  ).length;
}

/**
 * Marks a folder as a base, by making Trayful's own folder in it. That folder ignores
 * itself in git, since it holds the players and their keys, which must not be committed.
 */
export async function markBase(base: string): Promise<void> {
  const dir = path.join(base, TRAYFUL_DIR);
  await mkdir(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!existsSync(ignore)) await writeFile(ignore, '*\n');
}

/**
 * Brings the players along from a project that was served on its own, by Trayful 0.3
 * and earlier, so their invite links keep working. Returns a note for the person, if any.
 */
export async function adoptPlayers(base: string, project: string): Promise<string | undefined> {
  const old = path.join(base, project, TRAYFUL_DIR, 'players.json');
  if (!existsSync(old)) return undefined;
  const current = path.join(base, TRAYFUL_DIR, 'players.json');
  if (existsSync(current)) {
    return `${old} is from an earlier Trayful and is no longer read; the players are in ${current}. Delete the old file once you no longer need it.`;
  }
  await mkdir(path.dirname(current), { recursive: true });
  await rename(old, current);
  return `Moved the players from ${old} to ${current}, where Trayful keeps them now.`;
}
