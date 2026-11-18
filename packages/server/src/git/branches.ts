// Branches of a git-backed workspace: listing them, starting one for an experiment, moving to another.
import { GitError } from './git.js';
import { checkBranch } from './settings.js';
import { commitOf, remoteRef, type Run } from './sync.js';

/** The repository's branches, sorted by name. */
export async function listBranches(run: Run): Promise<string[]> {
  const listed = await run(['ls-remote', '--heads', 'origin']);
  return listed.stdout
    .split('\n')
    .map((line) => line.split('\trefs/heads/')[1])
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Starts `name` from the commit Trayful is on, and pushes it. Throws if the
 * repository has that branch already.
 */
export async function startBranch(run: Run, name: string): Promise<void> {
  checkBranch(name);
  if ((await listBranches(run)).includes(name)) {
    throw new GitError(`The repository already has a branch "${name}"; switch to it instead.`);
  }
  await run(['checkout', '--quiet', '-b', name]);
  await run(['push', '--quiet', 'origin', `HEAD:refs/heads/${name}`]);
  await run(['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${name}:${remoteRef(name)}`]);
}

/**
 * Checks out the repository's branch `name`. Git refuses, and so does this, if a
 * change not committed (such as a saved table) would be lost.
 */
export async function checkOutBranch(run: Run, name: string): Promise<void> {
  checkBranch(name);
  if (!(await listBranches(run)).includes(name)) {
    throw new GitError(`The repository has no branch "${name}". Start one with create_branch.`);
  }
  await run(['fetch', '--quiet', '--no-tags', 'origin', `+refs/heads/${name}:${remoteRef(name)}`]);
  const commit = await commitOf(run, remoteRef(name));
  await run(['checkout', '--quiet', '-B', name, commit!]);
}

/**
 * Commits the saved tables in the project folder, which syncs leave out. False when
 * none changed, or when the repository's `.gitignore` keeps them out.
 */
export async function commitTables(run: Run, folder: string, message: string): Promise<boolean> {
  const tables = `:(glob)${folder ? `${folder}/` : ''}**/tables/**`;
  // Git refuses to add a pathspec that matches nothing, so look first.
  const listed = await run(['status', '--porcelain', '--untracked-files=all', '--', tables]);
  if (!listed.stdout.trim()) return false;
  await run(['add', '--all', '--', tables]);
  const nothing = (await run(['diff', '--cached', '--quiet'], [0, 1])).code === 0;
  if (nothing) return false;
  await run(['commit', '--quiet', '--no-verify', '-m', message]);
  return true;
}
