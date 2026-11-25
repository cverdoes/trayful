// Ties a repository to the workspace it feeds: connecting attaches the projects, syncing reloads them.
import { FilePlayerStore } from '../play/players.js';
import { checkLimits } from '../play/limits.js';
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
    const opened = {
      ...options,
      playerStore,
      beforeNewProject: (id: string) => repository.includeProject(id),
    };
    const workspace = repository.settings
      ? await Workspace.open(repository.projectRoot, firstProject(repository, opened))
      : await Workspace.empty(opened);
    return new GitLink(repository, workspace, opened, times);
  }

  /** Connects the repository and opens its projects. */
  async connect(input: ConnectInput): Promise<RepositoryStatus> {
    await checkLimits(this.workspace.limits, { kind: 'repository' });
    await this.repository.connect(input);
    await this.workspace.attach(
      this.repository.projectRoot,
      firstProject(this.repository, this.openOptions),
    );
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
      await this.workspace.attach(
        this.repository.projectRoot,
        firstProject(this.repository, this.openOptions),
      );
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

/** Opens the project asked for, or else the one the repository's folder named, if any. */
function firstProject(repository: Repository, options: OpenOptions): OpenOptions {
  return { ...options, project: options.project ?? repository.settings?.project };
}
