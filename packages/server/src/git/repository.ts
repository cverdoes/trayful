// A git-backed workspace's repository: connecting to it, syncing with it, and how the two stand.
import { appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { slugify } from '@trayful/formats';
import { projectDirs } from '../projects/base.js';
import { createProjectFolder } from '../projects/workspace.js';
import { addToCone, baseIn, projectFolders, setCone } from './cone.js';
import { git, GitError, writeAskpass, type GitAuthor, type GitOptions } from './git.js';
import { checkOutBranch, commitTables, listBranches, startBranch } from './branches.js';
import { checkSettings, loadSettings, saveSettings, type RepositorySettings } from './settings.js';
import {
  commitChanges,
  commitOf,
  distance,
  pathspec,
  remoteRef,
  syncOnce,
  type Conflict,
  type Run,
  type SyncResult,
} from './sync.js';

export interface RepositoryOptions {
  /** Trayful's own folder on the server: the clone and the settings live here. */
  dataDir: string;
  /** A token for HTTPS remotes, such as a GitHub fine-grained personal access token. */
  token?: string;
  author?: GitAuthor;
  /** Lets git read repositories on this computer's disk. Only for tests. */
  allowLocalUrls?: boolean;
  /** The secret a push webhook signs its events with. No webhook without one. */
  webhookSecret?: string;
}

/** What connecting would make that is not in the repository yet. */
export interface Fresh {
  /** The branch, when the repository has no branch by that name. */
  branch?: string;
  /** The folder of projects, when it has none: connecting starts one in it. */
  folder?: string;
}

/**
 * Connecting would make a new branch or a new project, which might be a typo: the caller
 * asks the person and connects again with `create`.
 */
export class FreshError extends GitError {
  constructor(readonly fresh: Fresh) {
    super(freshMessage(fresh));
  }
}

function freshMessage({ branch, folder }: Fresh): string {
  const where = folder ? `"${folder}"` : 'the top folder';
  const parts = [
    branch === undefined ? '' : `there is no branch "${branch}" yet`,
    folder === undefined ? '' : `there is no Trayful project in ${where} yet`,
  ].filter(Boolean);
  const them = parts.length > 1 ? 'them' : 'it';
  return `In this repository ${parts.join(', and ')}. Connect again with create to make ${them}.`;
}

/** Where to connect; `create` allows a new branch or project there. */
export interface ConnectInput {
  url: string;
  branch?: string;
  path?: string;
  create?: boolean;
}

/** How Trayful and the repository stand, for people and agents. */
export interface RepositoryStatus {
  connected: boolean;
  url?: string;
  branch?: string;
  path?: string;
  /** The commit Trayful is on, shortened. */
  head?: string;
  /** Commits Trayful has made that the branch does not have yet. */
  unpushed: number;
  /** Commits on the branch Trayful has not taken in yet, as of the last fetch. */
  behind: number;
  /** Files changed here and not committed yet, saved tables left out. */
  changed: string[];
  /** When the last sync ended, as an ISO date. */
  lastSync?: string;
  /** Why the last sync failed, if it did. */
  lastError?: string;
  conflict?: Conflict;
}

/**
 * The repository a git-backed workspace works in: a clone in `<dataDir>/repository`,
 * on one branch, with the projects in one folder of it. Commands run one at a time.
 */
export class Repository {
  private settingsNow: RepositorySettings | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private conflictNow: Conflict | undefined;
  private lastSync: Date | undefined;
  private lastError: string | undefined;
  private askpass: string | undefined;
  private changeListeners = new Set<() => Promise<void>>();

  private constructor(private readonly options: RepositoryOptions) {}

  /** The repository in a data folder, connected if it was before. */
  static async open(options: RepositoryOptions): Promise<Repository> {
    const dataDir = path.resolve(options.dataDir);
    const repository = new Repository({ ...options, dataDir });
    repository.settingsNow = await loadSettings(dataDir);
    if (options.token) repository.askpass = await writeAskpass(path.join(dataDir, '.trayful'));
    return repository;
  }

  get settings(): RepositorySettings | undefined {
    return this.settingsNow;
  }

  get webhookSecret(): string | undefined {
    return this.options.webhookSecret;
  }

  get dataDir(): string {
    return this.options.dataDir;
  }

  get cloneDir(): string {
    return path.join(this.options.dataDir, 'repository');
  }

  /** The folder of projects in the clone. Only once connected. */
  get projectRoot(): string {
    if (!this.settingsNow) throw new GitError('No repository is connected yet.');
    return path.join(this.cloneDir, this.settingsNow.path);
  }

  /** Called after a sync changed the project files. */
  onChange(listener: () => Promise<void>): void {
    this.changeListeners.add(listener);
  }

  /**
   * Clones the repository and checks out the branch, making it if it is new. A folder
   * with no project gets the starter in a folder of its own, committed and pushed. A
   * new branch or project needs `create`, so a typo does not make one: without it, a
   * `FreshError` says which. Throws if already connected.
   */
  connect(input: ConnectInput): Promise<RepositorySettings> {
    return this.serial(async () => {
      if (this.settingsNow) {
        throw new GitError(`Trayful is already connected to ${this.settingsNow.url}.`);
      }
      let settings = checkSettings(input, this.options.allowLocalUrls);
      await rm(this.cloneDir, { recursive: true, force: true });
      try {
        await git(
          [
            'clone',
            '--quiet',
            '--filter=blob:none',
            '--no-checkout',
            '--',
            settings.url,
            'repository',
          ],
          { ...this.gitOptions(), cwd: this.options.dataDir },
        );
        const start = await startingCommit(this.run, settings.branch);
        const { base, project } = await baseIn(this.run, start, settings.path);
        settings = { ...settings, path: base, ...(project ? { project } : {}) };
        const projects = await this.checkOut(settings, start);
        const fresh: Fresh = {
          ...((await commitOf(this.run, remoteRef(settings.branch)))
            ? {}
            : { branch: settings.branch }),
          ...(projects.length > 0 ? {} : { folder: settings.path }),
        };
        if (Object.keys(fresh).length > 0 && !input.create) throw new FreshError(fresh);
        if (fresh.folder !== undefined) settings = await this.startProject(settings);
        await this.sync1(settings, 'Trayful: start a prototype');
      } catch (err) {
        await rm(this.cloneDir, { recursive: true, force: true });
        throw err;
      }
      await saveSettings(this.options.dataDir, settings);
      this.settingsNow = settings;
      return settings;
    });
  }

  /** Commits what changed, takes in the branch's new commits and, unless `push` is false, pushes. */
  sync(message = 'Trayful: save changes', push = true): Promise<SyncResult> {
    return this.serial(() => this.sync1(this.connected(), message, push));
  }

  /** Commits what changed, and nothing more. False when nothing had. */
  save(message: string): Promise<boolean> {
    return this.serial(async () => {
      try {
        return await commitChanges(this.run, this.connected(), message);
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        throw err;
      }
    });
  }

  /**
   * Gives up Trayful's side of a conflict and takes the branch as it is. Trayful's
   * side stays on its conflict branch.
   */
  takeTheirs(): Promise<SyncResult> {
    return this.serial(async () => {
      const settings = this.connected();
      const conflict = this.conflictNow;
      if (!conflict) throw new GitError('There is no conflict to resolve.');
      // Whatever changed since the conflict goes to Trayful's side too, so nothing is lost.
      await commitChanges(this.run, settings, 'Trayful: save changes');
      await this.run([
        'push',
        '--quiet',
        '--force',
        'origin',
        `HEAD:refs/heads/${conflict.branch}`,
      ]);
      await this.run(['reset', '--quiet', '--hard', remoteRef(settings.branch)]);
      this.conflictNow = undefined;
      await this.changed();
      return { committed: false, pulled: true, pushed: false };
    });
  }

  /** The repository's branches. */
  branches(): Promise<string[]> {
    this.connected();
    return listBranches(this.run);
  }

  /**
   * Syncs, then starts the branch `name` from where Trayful is, pushes it and works
   * on it from now on: for an experiment, such as a second version of a deck.
   */
  createBranch(name: string): Promise<RepositorySettings> {
    return this.moveBranch(name, (run) => startBranch(run, name));
  }

  /** Syncs, then works on the repository's branch `name` from now on. The tables reload. */
  switchBranch(name: string): Promise<RepositorySettings> {
    return this.moveBranch(name, async (run) => {
      await checkOutBranch(run, name);
      await this.changed();
    });
  }

  /**
   * Makes room for a new project folder in the folder of projects: the clone checks out
   * only project folders, and git would not commit one outside them.
   */
  includeProject(id: string): Promise<void> {
    return this.serial(async () => {
      const folder = projectPath(this.connected(), id);
      // A folder that is there but no project, such as art, is just not checked out.
      const there = await this.run(['ls-tree', '--name-only', 'HEAD', '--', folder], [0, 128]);
      if (there.stdout.trim()) {
        throw new GitError(
          `The repository already has a folder "${folder}"; give the project another name.`,
        );
      }
      await addToCone(this.run, folder);
    });
  }

  /** Commits and pushes the saved tables, which syncs leave out. False when none had changed. */
  snapshotTables(message = 'Trayful: save the tables'): Promise<boolean> {
    return this.serial(async () => {
      const settings = this.connected();
      const committed = await commitTables(this.run, settings.path, message);
      if (committed) await this.sync1(settings, message);
      return committed;
    });
  }

  async status(): Promise<RepositoryStatus> {
    const settings = this.settingsNow;
    const known = {
      lastSync: this.lastSync?.toISOString(),
      lastError: this.lastError,
      conflict: this.conflictNow,
    };
    if (!settings) return { connected: false, unpushed: 0, behind: 0, changed: [], ...known };
    const head = await commitOf(this.run, 'HEAD');
    const porcelain = await this.run(['status', '--porcelain', ...pathspec(settings.path)]);
    return {
      connected: true,
      ...settings,
      head: head?.slice(0, 7),
      ...(await distance(this.run, settings.branch)),
      changed: porcelain.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3)),
      ...known,
    };
  }

  // -------------------------------------------------------------------------

  private async sync1(
    settings: RepositorySettings,
    message: string,
    push = true,
  ): Promise<SyncResult> {
    try {
      const result = await syncOnce(this.run, settings, {
        message,
        push,
        conflictBranch: () => this.conflictBranch(),
      });
      this.conflictNow = result.conflict;
      this.lastError = undefined;
      if (result.pulled) await this.changed(settings);
      return result;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.lastSync = new Date();
    }
  }

  /** Syncs first, so nothing is left behind, then moves to another branch and remembers it. */
  private moveBranch(name: string, move: (run: Run) => Promise<void>): Promise<RepositorySettings> {
    return this.serial(async () => {
      const settings = this.connected();
      const synced = await this.sync1(settings, 'Trayful: save changes');
      if (synced.conflict) {
        throw new GitError('Settle the conflict with the repository before changing branch.');
      }
      await move(this.run);
      const moved = { ...settings, branch: name };
      await saveSettings(this.options.dataDir, moved);
      this.settingsNow = moved;
      return moved;
    });
  }

  /** A conflict keeps its branch name until it is resolved, so later syncs update the same branch. */
  private conflictBranch(): string {
    if (this.conflictNow) return this.conflictNow.branch;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
    return `trayful/conflict-${stamp}`;
  }

  /** Checks out the branch with only its project folders. Returns those folders. */
  private async checkOut(
    settings: RepositorySettings,
    start: string | undefined,
  ): Promise<string[]> {
    // Players and their keys, and editors' half-written files, are never committed.
    await appendFile(
      path.join(this.cloneDir, '.git', 'info', 'exclude'),
      '\n# Trayful\n.trayful/\n*.tmp\n',
    );
    const projects = await projectFolders(this.run, start, settings.path);
    await setCone(this.run, projects);
    const branch = settings.branch;
    if (await commitOf(this.run, remoteRef(branch))) {
      await this.run(['checkout', '--quiet', '-B', branch, remoteRef(branch)]);
    } else if (start) {
      await this.run(['checkout', '--quiet', '-b', branch, start]);
    } else {
      await this.run(['checkout', '--quiet', '--orphan', branch]);
    }
    return projects;
  }

  /** Puts the starter in a folder of its own in the folder of projects, named after the repository. */
  private async startProject(settings: RepositorySettings): Promise<RepositorySettings> {
    const name = repositoryName(settings.url);
    const id = slugify(name) || 'prototype';
    await addToCone(this.run, projectPath(settings, id));
    await createProjectFolder(path.join(this.cloneDir, projectPath(settings, id)), name);
    return { ...settings, project: id };
  }

  /** Files came in or the branch moved: check out the projects there now, then reload. */
  private async changed(settings = this.connected()): Promise<void> {
    const head = await commitOf(this.run, 'HEAD');
    const committed = await projectFolders(this.run, head, settings.path);
    // A project made here and not committed yet stays checked out too.
    const base = path.join(this.cloneDir, settings.path);
    const local = (await projectDirs(base).catch(() => [])).map((dir) =>
      projectPath(settings, path.basename(dir)),
    );
    await setCone(this.run, [...new Set([...committed, ...local])]);
    for (const listener of this.changeListeners) await listener();
  }

  private connected(): RepositorySettings {
    if (!this.settingsNow) throw new GitError('No repository is connected yet.');
    return this.settingsNow;
  }

  private gitOptions(): GitOptions {
    return {
      cwd: this.cloneDir,
      token: this.options.token,
      askpass: this.askpass,
      author: this.options.author,
      allowLocalUrls: this.options.allowLocalUrls,
    };
  }

  private run: Run = (args, okCodes) => git(args, this.gitOptions(), okCodes);

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Where the branch starts from before it exists here: its own commit, or the default branch's. */
async function startingCommit(run: Run, branch: string): Promise<string | undefined> {
  return (
    (await commitOf(run, remoteRef(branch))) ?? (await commitOf(run, 'refs/remotes/origin/HEAD'))
  );
}

/** A project's folder, relative to the top of the repository. */
function projectPath(settings: RepositorySettings, id: string): string {
  return settings.path ? `${settings.path}/${id}` : id;
}

/** A name for a new project: the repository's, in words. */
function repositoryName(url: string): string {
  const last = url.split(/[/:]/).filter(Boolean).at(-1) ?? 'Prototype';
  const words = last
    .replace(/\.git$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : 'Prototype';
}
