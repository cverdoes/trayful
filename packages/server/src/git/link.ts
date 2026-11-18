// Ties a repository to the workspace it feeds: connecting attaches the projects, syncing reloads them.
import { FilePlayerStore } from '../play/players.js';
import { isProjectFolder } from '../projects/base.js';
import { Workspace, type OpenOptions } from '../projects/workspace.js';
import { AutoSync, DEFAULT_SYNC_TIMES, type SyncTimes } from './autosync.js';
import { Journal } from './journal.js';
import type { ConnectInput, Repository, RepositoryStatus } from './repository.js';
import type { SyncResult } from './sync.js';

/**
 * A git-backed workspace: the projects live in a repository's clone, and Trayful
 * commits, pulls and pushes them, by itself on timers and when asked. Without a
 * connected repository the workspace is empty until `connect`.
 */
export class GitLink {
  /** Who changed what since the last commit, for its message. */
  readonly journal = new Journal();
  private readonly autoSync: AutoSync | undefined;

  private constructor(
    readonly repository: Repository,
    readonly workspace: Workspace,
    private readonly openOptions: OpenOptions,
    times: SyncTimes | false,
  ) {
    repository.onChange(() => workspace.reloadAll());
    if (times) {
      this.autoSync = new AutoSync(
        { save: () => this.save(), sync: (push) => this.syncNow(undefined, push) },
        times,
      );
      workspace.onReload(() => this.autoSync?.changed());
      if (repository.settings) this.autoSync.start();
    }
  }

  /**
   * Opens the workspace on the repository's projects, or empty if none is connected
   * yet. `times` says how often to sync by itself; false for only when asked.
   */
  static async open(
    repository: Repository,
    options: OpenOptions = {},
    times: SyncTimes | false = DEFAULT_SYNC_TIMES,
  ): Promise<GitLink> {
    // Players stay with the server, never in the clone.
    const playerStore = FilePlayerStore.in(repository.dataDir);
    const opened = { ...options, playerStore, noNewProjects: () => noNewProjects(repository) };
    const workspace = repository.settings
      ? await Workspace.open(repository.projectRoot, opened)
      : await Workspace.empty(opened);
    return new GitLink(repository, workspace, opened, times);
  }

  /** Connects the repository and opens its projects. */
  async connect(input: ConnectInput): Promise<RepositoryStatus> {
    await this.repository.connect(input);
    await this.workspace.attach(this.repository.projectRoot, this.openOptions);
    this.autoSync?.start();
    return this.repository.status();
  }

  /**
   * Syncs with the repository, committing with `message` or one made from the
   * journal. If its project could not be opened before, such as because it had
   * errors, a sync that brought a fix opens it now.
   */
  async sync(message?: string): Promise<SyncResult> {
    const result = await this.syncNow(message, true);
    if (result.pushed) this.autoSync?.pushed();
    if (!this.workspace.ready) {
      await this.workspace.attach(this.repository.projectRoot, this.openOptions);
    }
    return result;
  }

  /** Commits and pushes the saved tables as they are now. False when none had changed. */
  async snapshotTables(message?: string): Promise<boolean> {
    await this.workspace.saveAll();
    return this.repository.snapshotTables(message);
  }

  status(): Promise<RepositoryStatus> {
    return this.repository.status();
  }

  close(): void {
    this.autoSync?.stop();
  }

  private async syncNow(message: string | undefined, push: boolean): Promise<SyncResult> {
    const result = await this.repository.sync(message ?? this.journal.message(), push);
    if (result.committed) this.journal.clear();
    return result;
  }

  private async save(): Promise<void> {
    if (await this.repository.save(this.journal.message())) this.journal.clear();
  }
}

/**
 * Why a new project cannot be made, when the repository's folder is itself a project:
 * Trayful checks out and commits only that folder, so a project beside it would be lost.
 */
function noNewProjects(repository: Repository): string | undefined {
  const folder = repository.settings?.path;
  if (folder === undefined || !isProjectFolder(repository.projectRoot)) return undefined;
  return `Trayful works on the one project in ${folder ? `"${folder}"` : 'the top folder'} of the repository. To have several, start it with a new data folder connected to the folder that holds them.`;
}
