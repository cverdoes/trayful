import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CommandError,
  createTable,
  fromTableFile,
  TableEngine,
  toTableFile,
  type ClientMessage,
  type ProjectView,
  type ServerMessage,
  type TableState,
} from '@trayful/core';
import { formatDiagnostic, loadProject, type ResolvedProject } from '@trayful/formats';

export class ProjectLoadError extends Error {}

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

  private constructor(
    readonly project: ResolvedProject,
    readonly tableName: string,
    readonly engine: TableEngine,
    private readonly saveDelayMs: number,
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
    options: { seed?: number; saveDelayMs?: number } = {},
  ): Promise<TableSession> {
    if (!TABLE_NAME.test(tableName)) {
      throw new ProjectLoadError(
        `Table names use lowercase letters, digits and dashes; got "${tableName}".`,
      );
    }
    const { project, diagnostics } = await loadProject(projectDir);
    if (!project) {
      const problems = diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
      throw new ProjectLoadError(
        `The project in ${projectDir} has errors:\n  ${problems.join('\n  ')}`,
      );
    }
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
      state = createTable(project, { name: tableName, seed: options.seed });
    }
    const session = new TableSession(
      project,
      tableName,
      new TableEngine(state, project.types),
      options.saveDelayMs ?? 250,
    );
    await session.save();
    return session;
  }

  get file(): string {
    return tableFile(this.project, this.tableName);
  }

  view(): ProjectView {
    return {
      name: this.project.manifest.name,
      table: this.tableName,
      palette: this.project.palette,
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
    };
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
          this.engine.replace(
            createTable(this.project, { name: this.tableName, seed: message.seed }),
          );
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
        err instanceof CommandError ? err.message : `Invalid message: ${(err as Error).message}`;
      return {
        type: 'error',
        message: text,
        requestId: message.type === 'command' ? message.requestId : undefined,
      };
    }
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
    await this.save();
    this.listeners.clear();
  }
}

function tableFile(project: ResolvedProject, name: string): string {
  return path.join(project.dir, 'tables', `${name}.json`);
}
