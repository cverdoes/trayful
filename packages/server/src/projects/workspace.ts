import { existsSync, watch, type FSWatcher } from 'node:fs';
import { cp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fromTableFile, toTableFile } from '@trayful/core';
import {
  formatDiagnostic,
  loadProject,
  MANIFEST_FILE,
  slugify,
  type Diagnostic,
  type ResolvedProject,
} from '@trayful/formats';
import { packagedVersion, resourceDir } from './resources.js';
import { FilePlayerStore, Players, type Player, type PlayerStore } from './players.js';
import { checkTableName, ProjectLoadError, TableSession, tableFile } from './session.js';

/** One project folder in the workspace. */
export interface ProjectEntry {
  /** The folder name, used to address the project. */
  id: string;
  dir: string;
  /** The loaded project, or the last version that loaded cleanly. */
  project?: ResolvedProject;
  /** Errors from the latest load; empty when the files are fine. */
  problems: string[];
  /** Increases with every successful reload. */
  version: number;
}

export interface WorkspaceOptions {
  /** Reload projects when their files change. Default true. */
  watch?: boolean;
  saveDelayMs?: number;
  /** Where players are kept. Default: `.trayful/players.json` in the root folder. */
  playerStore?: PlayerStore;
}

/** Where `trayful new` and `create_project` copy a fresh project from. */
export function starterDir(): string {
  return resourceDir('starter');
}

const DEFAULT_TABLE = 'table-1';
/**
 * Path parts whose files do not affect the project definition: saved tables, installed
 * dependencies, and anything whose name starts with a dot. That covers folders such as
 * `.git` and `.vscode` and files such as `.DS_Store`, which tools write on their own.
 */
const IGNORED_PART = /(?:^|[\\/])(?:tables|node_modules|\.[^\\/]*)(?:[\\/]|$)/;

/** Whether a change to `file` can be skipped. `.tmp` files are editors' half-written saves. */
function ignored(file: string): boolean {
  return IGNORED_PART.test(file) || file.endsWith('.tmp');
}

/**
 * The projects Trayful serves and their open tables. The root is either one
 * project folder (with a `trayful.yaml`) or a folder whose sub-folders are
 * projects. Project files are watched, so edits show up on open tables at once.
 */
export class Workspace {
  private entries = new Map<string, ProjectEntry>();
  private sessions = new Map<string, TableSession>();
  private opening = new Map<string, Promise<TableSession>>();
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  private listeners = new Set<(entry: ProjectEntry) => void>();
  /** The table agents play on unless they open another. */
  active!: TableSession;

  private constructor(
    readonly root: string,
    /** True when the root is itself a project, so no other projects can be created. */
    readonly single: boolean,
    private readonly options: WorkspaceOptions,
    /** Everyone who has played here, shared by all tables. */
    readonly players: Players,
  ) {}

  static async open(
    root: string,
    options: WorkspaceOptions & {
      project?: string;
      table?: string;
      seed?: number;
      setup?: string | false;
    } = {},
  ): Promise<Workspace> {
    root = path.resolve(root);
    const single = existsSync(path.join(root, MANIFEST_FILE));
    const players = await Players.open(options.playerStore ?? FilePlayerStore.in(root));
    const workspace = new Workspace(root, single, options, players);
    const dirs = single ? [root] : await projectDirs(root);
    for (const dir of dirs) await workspace.load(path.basename(dir), dir);

    const entries = workspace.projects();
    if (entries.length === 0) {
      throw new ProjectLoadError(
        `No Trayful project in ${root}: there is no ${MANIFEST_FILE} here or in its sub-folders. ` +
          'Start one with `trayful new <folder>`.',
      );
    }
    const wanted = options.project ?? entries.find((e) => e.project)?.id ?? entries[0]!.id;
    const entry = workspace.entry(wanted);
    if (!entry.project) {
      throw new ProjectLoadError(
        `The project in ${entry.dir} has errors:\n  ${entry.problems.join('\n  ')}`,
      );
    }
    workspace.active = await workspace.table(entry.id, options.table ?? DEFAULT_TABLE, {
      seed: options.seed,
      setup: options.setup,
    });
    if (options.watch ?? true) workspace.watchAll();
    return workspace;
  }

  /** Every project, sorted by id. */
  projects(): ProjectEntry[] {
    return [...this.entries.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  entry(id: string = this.active.projectId): ProjectEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      const known = [...this.entries.keys()].join(', ');
      throw new ProjectLoadError(`No project "${id}". Projects: ${known}.`);
    }
    return entry;
  }

  /** A loaded project, or an error naming its problems. */
  project(id?: string): ResolvedProject {
    const entry = this.entry(id);
    if (!entry.project) {
      throw new ProjectLoadError(
        `The project "${entry.id}" has errors:\n  ${entry.problems.join('\n  ')}`,
      );
    }
    return entry.project;
  }

  /** Opens a table, creating it from the project (and its setup) if it does not exist yet. */
  async table(
    projectId: string,
    name: string,
    options: { seed?: number; setup?: string | false; create?: boolean } = {},
  ): Promise<TableSession> {
    checkTableName(name);
    const key = `${projectId}/${name}`;
    const open = this.sessions.get(key);
    if (open) return open;
    // A page asks for its table over HTTP and the socket at once; open it only once.
    const pending = this.opening.get(key);
    if (pending) return pending;
    const project = this.project(projectId);
    if (options.create === false && !existsSync(tableFile(project, name))) {
      throw new ProjectLoadError(`Project "${projectId}" has no table "${name}".`);
    }
    const opening = TableSession.create(project, name, {
      seed: options.seed,
      setup: options.setup,
      saveDelayMs: this.options.saveDelayMs,
      version: this.entry(projectId).version,
      players: this.players,
    });
    this.opening.set(key, opening);
    try {
      const session = await opening;
      this.sessions.set(key, session);
      return session;
    } finally {
      this.opening.delete(key);
    }
  }

  /** Saved and open tables of a project, sorted by name. */
  async tables(projectId: string): Promise<string[]> {
    const entry = this.entry(projectId);
    const names = new Set<string>();
    try {
      for (const file of await readdir(path.join(entry.dir, 'tables'))) {
        if (file.endsWith('.json')) names.add(file.slice(0, -'.json'.length));
      }
    } catch {
      // No tables folder yet.
    }
    for (const key of this.sessions.keys()) {
      const [p, t] = key.split('/');
      if (p === projectId) names.add(t!);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  }

  /** Copies a table under a new name, so a game can branch. */
  async duplicateTable(projectId: string, from: string, to: string): Promise<TableSession> {
    checkTableName(to);
    const project = this.project(projectId);
    if (existsSync(tableFile(project, to)) || this.sessions.has(`${projectId}/${to}`)) {
      throw new ProjectLoadError(`Project "${projectId}" already has a table "${to}".`);
    }
    const source = await this.table(projectId, from, { create: false });
    await source.save();
    const state = fromTableFile(JSON.parse(await readFile(source.file, 'utf8')));
    await mkdir(path.dirname(tableFile(project, to)), { recursive: true });
    await writeFile(
      tableFile(project, to),
      JSON.stringify(toTableFile({ ...state, table: to }), null, 2) + '\n',
    );
    return this.table(projectId, to, { create: false });
  }

  /** Deletes a saved table. The table agents are playing on cannot be deleted. */
  async deleteTable(projectId: string, name: string): Promise<void> {
    const key = `${projectId}/${name}`;
    const session = this.sessions.get(key);
    if (session === this.active) {
      throw new ProjectLoadError(
        `"${name}" is the table agents are playing on; open another table first.`,
      );
    }
    const project = this.project(projectId);
    if (!session && !existsSync(tableFile(project, name))) {
      throw new ProjectLoadError(`Project "${projectId}" has no table "${name}".`);
    }
    if (session) {
      await session.close();
      this.sessions.delete(key);
    }
    await rm(tableFile(project, name), { force: true });
  }

  /** Makes a new project from the starter template. Only when the root is a folder of projects. */
  async createProject(name: string): Promise<ProjectEntry> {
    if (this.single) {
      throw new ProjectLoadError(
        `Trayful was started on the project in ${this.root}. Start it on a folder of projects to create more.`,
      );
    }
    const id = slugify(name);
    if (!id) throw new ProjectLoadError(`"${name}" does not make a usable folder name.`);
    const dir = path.join(this.root, id);
    if (existsSync(dir)) throw new ProjectLoadError(`There is already a folder "${id}".`);
    await createProjectFolder(dir, name);
    const entry = await this.load(id, dir);
    if (this.options.watch ?? true) this.watch(entry);
    return entry;
  }

  /** Reloads a project's files, updating its open tables. Returns the problems, if any. */
  async reload(projectId: string): Promise<string[]> {
    const entry = this.entry(projectId);
    await this.load(entry.id, entry.dir);
    return entry.problems;
  }

  /** Renames a player, and shows the new name at every open table. */
  async renamePlayer(id: string, name: string): Promise<Player> {
    const player = await this.players.rename(id, name);
    for (const session of this.sessions.values()) session.broadcastPlayers();
    return player;
  }

  /** Called after every reload, with the project's new state. */
  onReload(listener: (entry: ProjectEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    for (const watcher of this.watchers) watcher.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const session of this.sessions.values()) await session.close();
  }

  // -------------------------------------------------------------------------

  private async load(id: string, dir: string): Promise<ProjectEntry> {
    const { project, diagnostics } = await loadProject(dir);
    const entry = this.entries.get(id) ?? { id, dir, problems: [], version: 0 };
    this.entries.set(id, entry);
    entry.problems = errors(diagnostics);
    const sessions = [...this.sessions.entries()]
      .filter(([key]) => key.startsWith(`${id}/`))
      .map(([, s]) => s);
    if (project) {
      entry.project = project;
      entry.version++;
      for (const session of sessions) session.setProject(project, entry.version);
    } else {
      for (const session of sessions) session.reportProblems(entry.problems);
    }
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  private watchAll(): void {
    for (const entry of this.entries.values()) this.watch(entry);
  }

  private watch(entry: ProjectEntry): void {
    try {
      const watcher = watch(entry.dir, { recursive: true }, (_event, file) => {
        if (file && ignored(file)) return;
        // Editors often write a file in several steps; reload once they settle.
        clearTimeout(this.timers.get(entry.id));
        this.timers.set(
          entry.id,
          setTimeout(() => void this.load(entry.id, entry.dir), 150),
        );
      });
      this.watchers.push(watcher);
    } catch {
      // Watching is a convenience; without it, people reload by restarting.
    }
  }
}

function errors(diagnostics: Diagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === 'error').map(formatDiagnostic);
}

async function projectDirs(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => path.join(root, e.name))
    .filter((dir) => existsSync(path.join(dir, MANIFEST_FILE)));
}

/** Where packaged Trayful releases are served from, file by file, for editor schema hints. */
const RELEASE_FILES = 'https://cdn.jsdelivr.net/npm/trayful';

/**
 * Where a YAML file in `dir` finds the JSON Schemas for editor hints: the published
 * release this copy of Trayful came from, or this repository's schemas.
 */
function schemaFolder(dir: string): string {
  const version = packagedVersion();
  if (version) return `${RELEASE_FILES}@${version}/resources/schemas`;
  return path.relative(dir, resourceDir('schemas')).split(path.sep).join('/');
}

/** Copies the starter project into `dir` and gives it a name. */
export async function createProjectFolder(dir: string, name: string): Promise<void> {
  if (existsSync(path.join(dir, MANIFEST_FILE))) {
    throw new ProjectLoadError(`There is already a project in ${dir}.`);
  }
  const starter = starterDir();
  await cp(starter, dir, {
    recursive: true,
    // The starter's README describes the template, not the new game.
    filter: (src) => !['tables', 'README.md'].includes(path.basename(src)) || src === starter,
  });
  const files = (await readdir(dir, { recursive: true })).filter((f) => /\.ya?ml$/.test(f));
  for (const file of files) {
    const full = path.join(dir, file);
    let text = await readFile(full, 'utf8');
    text = text.replace(/\$schema=\S*\/schema\//, `$schema=${schemaFolder(path.dirname(full))}/`);
    if (file === MANIFEST_FILE) text = text.replace(/^name: .*$/m, `name: ${JSON.stringify(name)}`);
    await writeFile(full, text);
  }
}
