// Runs the system `git` for a git-backed workspace, hardened for repository URLs it is given.
import { execFile } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** A git command that failed, or a repository setting git cannot use. */
export class GitError extends Error {}

/** Who commits: the name and email address on Trayful's commits. */
export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitOptions {
  /** The folder git runs in. */
  cwd: string;
  /**
   * A token for HTTPS remotes, such as a GitHub fine-grained personal access token.
   * Git asks for it through `askpass`; it is never written to the repository's config.
   */
  token?: string;
  /** The script git asks for the token, from `writeAskpass`. Needed with a token. */
  askpass?: string;
  author?: GitAuthor;
  /** Lets git read repositories on this computer's disk. Only for tests. */
  allowLocalUrls?: boolean;
  /** How long one command may take. Default two minutes. */
  timeoutMs?: number;
}

export interface GitResult {
  stdout: string;
  /** The exit code; only ever one of the codes the caller said were fine. */
  code: number;
}

const DEFAULT_AUTHOR: GitAuthor = { name: 'Trayful', email: 'trayful@localhost' };
const MEGABYTE = 1024 * 1024;

/**
 * Settings on every command, so a repository cannot make the server run code or read
 * its disk: no hooks, no `file://` or `ext::` transports, no submodules, no
 * credential helpers or file system monitors from the computer's own git config.
 */
function hardening(allowLocalUrls: boolean): string[] {
  return [
    ['protocol.file.allow', allowLocalUrls ? 'always' : 'never'],
    ['protocol.ext.allow', 'never'],
    ['core.hooksPath', '/dev/null'],
    ['core.fsmonitor', 'false'],
    ['submodule.recurse', 'false'],
    ['credential.helper', ''],
    ['advice.detachedHead', 'false'],
    ['init.defaultBranch', 'main'],
  ].flatMap(([key, value]) => ['-c', `${key}=${value}`]);
}

/**
 * Runs `git <args>` without a shell. Exit codes other than `okCodes` throw a `GitError`
 * with git's own message, with the token taken out should git ever repeat it.
 */
export function git(args: string[], options: GitOptions, okCodes = [0]): Promise<GitResult> {
  const author = options.author ?? DEFAULT_AUTHOR;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
    // Never ask anyone at a terminal; the token, if any, is the only answer.
    GIT_ASKPASS: options.askpass ?? 'true',
    SSH_ASKPASS: options.askpass ?? 'true',
    TRAYFUL_GIT_TOKEN: options.token ?? '',
  };
  const all = [...hardening(options.allowLocalUrls ?? false), ...args];
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      all,
      { cwd: options.cwd, env, timeout: options.timeoutMs ?? 120_000, maxBuffer: 16 * MEGABYTE },
      (err, stdout, stderr) => {
        const code = exitCode(err);
        if (okCodes.includes(code)) return resolve({ stdout, code });
        const said = (stderr || stdout || (err?.message ?? '')).trim();
        reject(new GitError(`git ${args[0] ?? ''} failed: ${scrub(said, options.token)}`));
      },
    );
  });
}

/** The exit code of a finished command; -1 when it did not exit by itself, such as on a timeout. */
function exitCode(err: { code?: unknown } | null): number {
  if (!err) return 0;
  return typeof err.code === 'number' ? err.code : -1;
}

function scrub(text: string, token: string | undefined): string {
  return token ? text.split(token).join('***') : text;
}

/**
 * Writes the script git runs to ask for a password: it answers with the token from the
 * environment of the git command, so the token itself is never on disk.
 */
export async function writeAskpass(dir: string): Promise<string> {
  const file = path.join(dir, 'git-askpass.sh');
  await mkdir(dir, { recursive: true });
  await writeFile(
    file,
    [
      '#!/bin/sh',
      '# Written by Trayful: answers git with the token it was started with.',
      'case "$1" in',
      '  Username*) echo x-access-token ;;',
      '  *) echo "$TRAYFUL_GIT_TOKEN" ;;',
      'esac',
      '',
    ].join('\n'),
  );
  await chmod(file, 0o700);
  return file;
}
