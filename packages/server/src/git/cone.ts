// Which folders of the repository Trayful checks out: the projects in its folder of projects, and nothing else.
import path from 'node:path';
import { MANIFEST_FILE } from '@trayful/formats';
import { GitError } from './git.js';
import type { Run } from './sync.js';

/** The base folder and, when the folder given was one project, that project. */
export interface BaseInRepository {
  /** The folder of projects, relative to the top; `''` for the top itself. */
  base: string;
  project?: string;
}

/**
 * Reads a folder someone gave as the folder of projects. A project's own folder is short
 * for the folder it is in, as on the command line, so `prototype` in a game repository
 * works on the top folder and opens `prototype` first.
 */
export async function baseIn(
  run: Run,
  ref: string | undefined,
  folder: string,
): Promise<BaseInRepository> {
  if (!ref || !(await hasManifest(run, ref, folder))) return { base: folder };
  if (!folder) {
    throw new GitError(
      `The top of this repository is a Trayful project itself, and Trayful works on a folder of projects. Move the project into a folder of its own, such as prototype/, and connect again.`,
    );
  }
  const parent = path.posix.dirname(folder);
  return { base: parent === '.' ? '' : parent, project: path.posix.basename(folder) };
}

/** Whether `folder` on `ref` holds a `trayful.yaml`. Reads trees only: file contents come with checkout. */
async function hasManifest(run: Run, ref: string, folder: string): Promise<boolean> {
  const file = folder ? `${folder}/${MANIFEST_FILE}` : MANIFEST_FILE;
  return (await run(['ls-tree', '--name-only', ref, '--', file])).stdout.trim() !== '';
}

/** The project folders right under `base` on `ref`, relative to the top of the repository. */
export async function projectFolders(
  run: Run,
  ref: string | undefined,
  base: string,
): Promise<string[]> {
  if (!ref) return [];
  const listed = await run(['ls-tree', '-r', '--name-only', ref, '--', base || '.']);
  const prefix = base ? `${base}/` : '';
  return listed.stdout
    .split('\n')
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length).split('/'))
    .flatMap(([dir, file, ...deeper]) =>
      dir && file === MANIFEST_FILE && deeper.length === 0 && !dir.startsWith('.')
        ? [prefix + dir]
        : [],
    );
}

/**
 * Checks out only these folders, and the files at the top of the repository. A game
 * repository's art and code stay out of the clone's working files.
 */
export async function setCone(run: Run, folders: string[]): Promise<void> {
  await run(['sparse-checkout', 'set', '--cone', '--', ...folders]);
}

/** Adds a folder to the ones checked out, such as a new project, before anything is written there. */
export async function addToCone(run: Run, folder: string): Promise<void> {
  await run(['sparse-checkout', 'add', '--', folder]);
}
