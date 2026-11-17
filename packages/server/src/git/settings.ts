// Which repository a git-backed workspace works on, checked before git ever sees it, and where that is kept.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GitError } from './git.js';

/** The repository, branch and folder Trayful works on. Holds no secrets. */
export interface RepositorySettings {
  /** `https://…` or an SSH address such as `git@github.com:me/game.git`. */
  url: string;
  branch: string;
  /** The folder in the repository with the project, or a folder of projects; `''` for the top. */
  path: string;
}

const HTTPS = /^https:\/\/[^\s/@:]+(?::\d+)?\/[^\s]+$/;
/** `ssh://user@host/owner/repo.git` */
const SSH_URL = /^ssh:\/\/[\w.-]+@[\w.-]+(?::\d+)?\/\S+$/;
/** `user@host:owner/repo.git`, as GitHub shows it. */
const SSH_SHORT = /^[\w.-]+@[\w.-]+:\S+$/;
const LOCAL = /^file:\/\/\/[^\s]+$/;

/**
 * Checks what someone typed and returns it tidied: the folder without slashes at
 * either end. Throws a `GitError` saying what is wrong.
 */
export function checkSettings(
  input: { url: string; branch?: string; path?: string },
  allowLocalUrls = false,
): RepositorySettings {
  const url = input.url.trim();
  if (
    !HTTPS.test(url) &&
    !SSH_URL.test(url) &&
    !SSH_SHORT.test(url) &&
    !(allowLocalUrls && LOCAL.test(url))
  ) {
    throw new GitError(
      'Give the repository as an https:// address without a password in it, such as https://github.com/me/my-game, or an SSH address such as git@github.com:me/my-game.git.',
    );
  }
  const branch = (input.branch ?? 'main').trim();
  checkBranch(branch);
  return { url, branch, path: checkFolder(input.path ?? '') };
}

/** Throws unless `name` is a branch name git accepts and no option in disguise. */
export function checkBranch(name: string): void {
  const bad =
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name) ||
    name.endsWith('/') ||
    name.endsWith('.') ||
    name.endsWith('.lock') ||
    name.includes('..') ||
    name.includes('//') ||
    name.includes('/.') ||
    name.length > 200;
  if (bad) {
    throw new GitError(
      `"${name}" is not a usable branch name: use letters, digits, dashes, dots and slashes, such as prototype or trayful/deck-v2.`,
    );
  }
}

function checkFolder(folder: string): string {
  const parts = folder.trim().split('/');
  // Slashes at either end mean nothing.
  while (parts[0] === '') parts.shift();
  while (parts.at(-1) === '') parts.pop();
  if (parts.length === 0 || (parts.length === 1 && parts[0] === '.')) return '';
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.startsWith('.git'))) {
    throw new GitError(`"${folder}" is not a folder inside the repository.`);
  }
  return parts.join('/');
}

/** Where the settings are kept: `.trayful/repository.json` in the data folder. */
function settingsFile(dataDir: string): string {
  return path.join(dataDir, '.trayful', 'repository.json');
}

export async function loadSettings(dataDir: string): Promise<RepositorySettings | undefined> {
  try {
    return JSON.parse(await readFile(settingsFile(dataDir), 'utf8')) as RepositorySettings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

export async function saveSettings(dataDir: string, settings: RepositorySettings): Promise<void> {
  const file = settingsFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(settings, null, 2) + '\n');
}
