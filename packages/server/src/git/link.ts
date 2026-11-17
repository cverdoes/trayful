// Ties a repository to the workspace it feeds: connecting attaches the projects, syncing reloads them.
import { FilePlayerStore } from '../play/players.js';
import { Workspace, type OpenOptions } from '../projects/workspace.js';
import type { Repository, RepositoryStatus } from './repository.js';
import type { SyncResult } from './sync.js';

/**
 * A git-backed workspace: the projects live in a repository's clone, and Trayful
 * commits, pulls and pushes them. Without a connected repository the workspace is
 * empty until `connect`.
 */
export class GitLink {
  private constructor(
    readonly repository: Repository,
    readonly workspace: Workspace,
    private readonly openOptions: OpenOptions,
  ) {
    repository.onChange(() => workspace.reloadAll());
  }

  /** Opens the workspace on the repository's projects, or empty if none is connected yet. */
  static async open(repository: Repository, options: OpenOptions = {}): Promise<GitLink> {
    // Players stay with the server, never in the clone.
    const playerStore = FilePlayerStore.in(repository.dataDir);
    const opened = { ...options, playerStore };
    const workspace = repository.settings
      ? await Workspace.open(repository.projectRoot, opened)
      : await Workspace.empty(opened);
    return new GitLink(repository, workspace, opened);
  }

  /** Connects the repository and opens its projects. */
  async connect(input: { url: string; branch?: string; path?: string }): Promise<RepositoryStatus> {
    await this.repository.connect(input);
    await this.workspace.attach(this.repository.projectRoot, this.openOptions);
    return this.repository.status();
  }

  /**
   * Syncs with the repository. If its project could not be opened before, such as
   * because it had errors, a sync that brought a fix opens it now.
   */
  async sync(message?: string): Promise<SyncResult> {
    const result = await this.repository.sync(message);
    if (!this.workspace.ready)
      await this.workspace.attach(this.repository.projectRoot, this.openOptions);
    return result;
  }

  status(): Promise<RepositoryStatus> {
    return this.repository.status();
  }
}
