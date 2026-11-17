// A repository on disk to stand in for GitHub, and a second clone to stand in for someone's computer.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProjectFolder } from '../../src/projects/workspace.js';

const identity = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Someone',
  GIT_AUTHOR_EMAIL: 'someone@example.com',
  GIT_COMMITTER_NAME: 'Someone',
  GIT_COMMITTER_EMAIL: 'someone@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** Runs git in `cwd` as "Someone", returning what it printed. */
export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], {
    cwd,
    env: identity,
    encoding: 'utf8',
    // Git's progress and warnings are no news in a test.
    stdio: 'pipe',
  });
}

export interface Remote {
  /** Folder for everything in this test. */
  root: string;
  /** The `file://` address of the bare repository. */
  url: string;
  /** A clone, as on someone's computer. */
  laptop: string;
}

/**
 * A bare repository with one commit on `main`: a README and, unless `empty`, a
 * starter project in `prototype/`. Also a clone of it on "the laptop".
 */
export async function makeRemote(options: { empty?: boolean } = {}): Promise<Remote> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trayful-git-'));
  const bare = path.join(root, 'game.git');
  sh(root, 'init', '--quiet', '--bare', bare);
  const url = `file://${bare}`;
  const laptop = path.join(root, 'laptop');
  sh(root, 'clone', '--quiet', url, laptop);
  if (!options.empty) {
    await writeFile(path.join(laptop, 'README.md'), '# My game\n');
    await createProjectFolder(path.join(laptop, 'prototype'), 'My Game');
    sh(laptop, 'add', '--all');
    sh(laptop, 'commit', '--quiet', '-m', 'Rules and a prototype');
    sh(laptop, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
  }
  return { root, url, laptop };
}

/** Changes a file on the laptop with `edit`, commits and pushes it. */
export async function pushFromLaptop(
  remote: Remote,
  file: string,
  edit: (text: string) => string,
): Promise<void> {
  const full = path.join(remote.laptop, file);
  sh(remote.laptop, 'pull', '--quiet', '--rebase', 'origin', 'main');
  await writeFile(full, edit(await readFile(full, 'utf8')));
  sh(remote.laptop, 'commit', '--quiet', '-am', `Edit ${file}`);
  sh(remote.laptop, 'push', '--quiet', 'origin', 'HEAD:refs/heads/main');
}
