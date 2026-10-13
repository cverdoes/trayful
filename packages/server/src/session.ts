import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CommandError,
  createTable,
  SetupError,
  syncTable,
  type RenderRequest,
  fromTableFile,
  TableEngine,
  toTableFile,
  type Activity,
  type ClientMessage,
  type ProjectView,
  type ServerMessage,
  type TableState,
} from '@trayful/core';
import { formatDiagnostic, loadProject, type ResolvedProject } from '@trayful/formats';

export class ProjectLoadError extends Error {}

/** A snapshot could not be taken, usually because no browser has the table open. */
export class SnapshotError extends Error {}

const TABLE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * One open table: the loaded project, its engine and its file on disk.
 * Every client message goes through `handle`, and every change is saved
 * to `tables/<name>.json` shortly after it happens.
 */
export class TableSession {
  private revision = 0;
  private listeners = new Set<(message: ServerMessage) => void>();
  private saveTimer: NodeJS.Timeout | undefined;
  private saving: Promise<void> = Promise.resolve();
  private activity: Activity | undefined;
  private snapshots = new Map<
    string,
    { resolve: (png: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  private constructor(
    private current: ResolvedProject,
    readonly tableName: string,
    readonly engine: TableEngine,
    private readonly saveDelayMs: number,
    private version: number,
  ) {
    engine.subscribe(() => {
      this.revision++;
      this.broadcast(this.stateMessage());
      this.scheduleSave();
    });
  }

  /** Loads a project and opens (or creates) one of its tables. */
  static async open(
    projectDir: string,
    tableName = 'table-1',
    options: { seed?: number; setup?: string | false; saveDelayMs?: number } = {},
  ): Promise<TableSession> {
    const { project, diagnostics } = await loadProject(projectDir);
    if (!project) {
      const problems = diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
      throw new ProjectLoadError(
        `The project in ${projectDir} has errors:\n  ${problems.join('\n  ')}`,
      );
    }
    return TableSession.create(project, tableName, options);
  }

  /** Opens (or creates) a table of a loaded project. */
  static async create(
    project: ResolvedProject,
    tableName = 'table-1',
    options: { seed?: number; setup?: string | false; saveDelayMs?: number; version?: number } = {},
  ): Promise<TableSession> {
    checkTableName(tableName);
    const file = tableFile(project, tableName);
    let state: TableState;
    try {
      state = fromTableFile(JSON.parse(await readFile(file, 'utf8')));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ProjectLoadError(
          `Could not open ${path.relative(project.dir, file)}: ${(err as Error).message}`,
        );
      }
      try {
        state = createTable(project, { name: tableName, seed: options.seed, setup: options.setup });
      } catch (err) {
        if (err instanceof SetupError) throw new ProjectLoadError(err.message);
        throw err;
      }
    }
    const session = new TableSession(
      project,
      tableName,
      new TableEngine(state, project.types),
      options.saveDelayMs ?? 250,
      options.version ?? 1,
    );
    await session.save();
    return session;
  }

  get project(): ResolvedProject {
    return this.current;
  }

  get projectId(): string {
    return projectId(this.current);
  }

  /**
   * Switches to freshly loaded project files: new type definitions apply at once,
   * and the table picks up changed, added and removed components as one undoable step.
   */
  setProject(project: ResolvedProject, version: number): void {
    this.current = project;
    this.version = version;
    this.engine.setCatalog(project.types);
    this.broadcast({ type: 'project', view: this.view() });
    const synced = syncTable(this.engine.state, project);
    if (synced !== this.engine.state) this.engine.replace(synced);
  }

  /** Tells the people watching that the project files have errors. */
  reportProblems(problems: string[]): void {
    this.broadcast({ type: 'problems', problems });
  }

  get file(): string {
    return tableFile(this.project, this.tableName);
  }

  view(): ProjectView {
    return {
      project: projectId(this.project),
      version: this.version,
      name: this.project.manifest.name,
      table: this.tableName,
      palette: this.project.palette,
      setups: Object.keys(this.project.setups),
      ...(this.project.manifest.setup ? { setup: this.project.manifest.setup } : {}),
      // Strip loader bookkeeping; clients only need the type definitions.
      types: Object.fromEntries(
        Object.entries(this.project.types).map(
          ([id, { source: _source, normalizedFields: _fields, ...type }]) => [id, type],
        ),
      ),
    };
  }

  stateMessage(): ServerMessage {
    return {
      type: 'state',
      state: this.engine.state,
      revision: this.revision,
      canUndo: this.engine.canUndo,
      canRedo: this.engine.canRedo,
      ...(this.activity ? { activity: this.activity } : {}),
    };
  }

  /** Makes a change on behalf of an agent, labelled so people watching see what it did. */
  asAgent<T>(text: string, change: () => T): T {
    this.activity = { by: 'agent', text };
    try {
      return change();
    } finally {
      this.activity = undefined;
    }
  }

  /** Number of browsers (or other clients) watching the table. */
  get watchers(): number {
    return this.listeners.size;
  }

  /** Asks a watching browser to render the whole table, and resolves with the PNG. */
  requestSnapshot(timeoutMs = 10_000): Promise<Buffer> {
    return this.requestPicture((id) => ({ type: 'snapshot-request', id }), timeoutMs);
  }

  /** Asks a watching browser to draw one component, and resolves with the PNG. */
  requestRender(component: RenderRequest, timeoutMs = 10_000): Promise<Buffer> {
    return this.requestPicture((id) => ({ type: 'render-request', id, component }), timeoutMs);
  }

  private requestPicture(request: (id: string) => ServerMessage, timeoutMs: number) {
    if (this.listeners.size === 0) {
      return Promise.reject(
        new SnapshotError(
          'No browser has the table open, so there is nothing to draw the picture with. Open the table in a browser first.',
        ),
      );
    }
    const id = randomUUID();
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.snapshots.delete(id);
        reject(new SnapshotError('The browser did not send the picture in time.'));
      }, timeoutMs);
      this.snapshots.set(id, { resolve, reject, timer });
      this.broadcast(request(id));
    });
  }

  private answerSnapshot(id: string, png?: string, error?: string): void {
    const pending = this.snapshots.get(id);
    if (!pending) return; // Another browser answered first, or it timed out.
    this.snapshots.delete(id);
    clearTimeout(pending.timer);
    if (png) pending.resolve(Buffer.from(png, 'base64'));
    else pending.reject(new SnapshotError(error ?? 'The browser could not draw the table.'));
  }

  /** Applies a client message. Returns an error message for the sender only, or nothing on success. */
  handle(message: ClientMessage): ServerMessage | undefined {
    if (typeof message !== 'object' || message === null) {
      return { type: 'error', message: 'Messages must be JSON objects with a "type".' };
    }
    try {
      switch (message.type) {
        case 'command':
          this.engine.dispatch(message.command);
          return undefined;
        case 'undo':
          this.engine.undo();
          return undefined;
        case 'redo':
          this.engine.redo();
          return undefined;
        case 'reset':
          this.reset(message.seed, message.setup);
          return undefined;
        case 'snapshot':
          this.answerSnapshot(message.id, message.png, message.error);
          return undefined;
        default:
          return {
            type: 'error',
            message: `Unknown message type "${(message as { type: string }).type}".`,
          };
      }
    } catch (err) {
      // Commands never change state when they throw, so any error is safe to report and move on.
      const text =
        err instanceof CommandError || err instanceof SetupError
          ? err.message
          : `Invalid message: ${(err as Error).message}`;
      return {
        type: 'error',
        message: text,
        requestId: message.type === 'command' ? message.requestId : undefined,
      };
    }
  }

  /**
   * Replaces the table with a fresh one from the project files, as one undoable step.
   * Uses the project's default setup unless another (or `false`, for none) is given.
   */
  reset(seed?: number, setup?: string | false): void {
    this.engine.replace(createTable(this.project, { name: this.tableName, seed, setup }));
  }

  subscribe(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(message: ServerMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), this.saveDelayMs);
  }

  /** Writes the table now. Writes go to a temporary file first so a crash never leaves half a file. */
  save(): Promise<void> {
    clearTimeout(this.saveTimer);
    const state = this.engine.state;
    this.saving = this.saving.then(async () => {
      const file = this.file;
      await mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(toTableFile(state), null, 2) + '\n');
      await rename(tmp, file);
    });
    return this.saving;
  }

  async close(): Promise<void> {
    for (const [id] of this.snapshots)
      this.answerSnapshot(id, undefined, 'The server is stopping.');
    await this.save();
    this.listeners.clear();
  }
}

export function tableFile(project: ResolvedProject, name: string): string {
  return path.join(project.dir, 'tables', `${name}.json`);
}

/** A project's id in its workspace: the name of its folder. */
export function projectId(project: ResolvedProject): string {
  return path.basename(project.dir);
}

export function checkTableName(name: string): void {
  if (!TABLE_NAME.test(name)) {
    throw new ProjectLoadError(
      `Table names use lowercase letters, digits and dashes; got "${name}".`,
    );
  }
}
