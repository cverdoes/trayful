// One sync of a git-backed workspace: commit what changed, take in the branch's new commits, push.
import type { GitResult } from './git.js';
import type { RepositorySettings } from './settings.js';

/** Runs one git command in the clone; `okCodes` are the exit codes that are no failure. */
export type Run = (args: string[], okCodes?: number[]) => Promise<GitResult>;

/** Both sides changed the same lines: Trayful's side waits on a branch of its own. */
export interface Conflict {
  /** The branch with Trayful's side, such as `trayful/conflict-20261117-0912`. */
  branch: string;
  /** The files both sides changed, relative to the top of the repository. */
  files: string[];
}

export interface SyncResult {
  /** Trayful committed changes made here. */
  committed: boolean;
  /** Commits from the branch came in, so the project files changed. */
  pulled: boolean;
  /** The branch now has Trayful's commits. */
  pushed: boolean;
  conflict?: Conflict;
}

/** What the branch's own folder covers, without saved tables: those change on every move. */
export function pathspec(folder: string): string[] {
  return ['--', folder || '.', ':(exclude,glob)**/tables/**'];
}

/** Commits every change in the project folder apart from saved tables. False when there were none. */
export async function commitChanges(
  run: Run,
  settings: RepositorySettings,
  message: string,
): Promise<boolean> {
  await run(['add', '--all', ...pathspec(settings.path)]);
  const nothing = (await run(['diff', '--cached', '--quiet'], [0, 1])).code === 0;
  if (nothing) return false;
  await run(['commit', '--quiet', '--no-verify', '-m', message]);
  return true;
}

/** A commit id, or undefined when `ref` names no commit (yet). */
export async function commitOf(run: Run, ref: string): Promise<string | undefined> {
  const found = await run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], [0, 1]);
  return found.code === 0 ? found.stdout.trim() : undefined;
}

export function remoteRef(branch: string): string {
  return `refs/remotes/origin/${branch}`;
}

/** Fetches the branch. Returns its newest commit, or undefined if the branch is not there yet. */
async function fetchBranch(run: Run, branch: string): Promise<string | undefined> {
  const listed = await run(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`]);
  if (!listed.stdout.trim()) return undefined;
  await run([
    'fetch',
    '--quiet',
    '--no-tags',
    'origin',
    `+refs/heads/${branch}:${remoteRef(branch)}`,
  ]);
  return commitOf(run, remoteRef(branch));
}

async function isAncestor(run: Run, older: string, newer: string): Promise<boolean> {
  return (await run(['merge-base', '--is-ancestor', older, newer], [0, 1])).code === 0;
}

/** Moves the branch and the files to `commit`, keeping changes to files it does not touch. */
async function moveTo(run: Run, commit: string): Promise<void> {
  await run(['reset', '--quiet', '--keep', commit]);
}

/**
 * Merges `theirs` into `ours` without touching the files: a merge with conflicts never
 * reaches the project folder, where it would stop the project loading. Returns the
 * merge commit, or the files both sides changed.
 */
async function mergeAside(
  run: Run,
  ours: string,
  theirs: string,
): Promise<{ commit: string } | { files: string[] }> {
  const merged = await run(
    ['merge-tree', '--write-tree', '--name-only', '--no-messages', ours, theirs],
    [0, 1],
  );
  const [tree, ...files] = merged.stdout.trim().split('\n');
  if (merged.code === 1) return { files: files.filter(Boolean) };
  const commit = await run([
    'commit-tree',
    tree!,
    '-p',
    ours,
    '-p',
    theirs,
    '-m',
    'Trayful: take in changes from the repository',
  ]);
  return { commit: commit.stdout.trim() };
}

/**
 * Takes in what is new on the branch: fast-forwards, or merges when both sides moved.
 * Returns whether the files changed, or the conflict.
 */
async function takeIn(run: Run, theirs: string): Promise<{ pulled: boolean; files?: string[] }> {
  const ours = await commitOf(run, 'HEAD');
  if (!ours || ours === theirs || (await isAncestor(run, theirs, ours))) return { pulled: false };
  if (await isAncestor(run, ours, theirs)) {
    await moveTo(run, theirs);
    return { pulled: true };
  }
  const merged = await mergeAside(run, ours, theirs);
  if ('files' in merged) return { pulled: false, files: merged.files };
  await moveTo(run, merged.commit);
  return { pulled: true };
}

/**
 * One sync: commit, fetch, take in, push. On a conflict Trayful's side is pushed to
 * `conflictBranch` instead, and the shared branch is left alone.
 */
export async function syncOnce(
  run: Run,
  settings: RepositorySettings,
  message: string,
  conflictBranch: () => string,
): Promise<SyncResult> {
  const committed = await commitChanges(run, settings, message);
  const theirs = await fetchBranch(run, settings.branch);
  const { pulled, files } = theirs ? await takeIn(run, theirs) : { pulled: false };
  const head = await commitOf(run, 'HEAD');
  if (files) {
    const conflict = { branch: conflictBranch(), files };
    await run(['push', '--quiet', '--force', 'origin', `HEAD:refs/heads/${conflict.branch}`]);
    return { committed, pulled, pushed: false, conflict };
  }
  const pushed = head !== undefined && head !== theirs;
  if (pushed) await run(['push', '--quiet', 'origin', `HEAD:refs/heads/${settings.branch}`]);
  return { committed, pulled, pushed };
}

/** How far the clone and the branch are apart, as of the last fetch. */
export async function distance(
  run: Run,
  branch: string,
): Promise<{ unpushed: number; behind: number }> {
  if (!(await commitOf(run, 'HEAD'))) return { unpushed: 0, behind: 0 };
  if (!(await commitOf(run, remoteRef(branch)))) {
    const all = await run(['rev-list', '--count', 'HEAD']);
    return { unpushed: Number(all.stdout.trim()), behind: 0 };
  }
  const counted = await run(['rev-list', '--left-right', '--count', `HEAD...${remoteRef(branch)}`]);
  const [unpushed = 0, behind = 0] = counted.stdout.trim().split(/\s+/).map(Number);
  return { unpushed, behind };
}
