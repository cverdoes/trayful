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
import { packagedVersion, resourceDir } from '../shipped/resources.js';
import { adoptPlayers, markBase, projectDirs, resolveBase } from './base.js';
import { FilePlayerStore, Players, type Player, type PlayerStore } from '../play/players.js';
import { checkTableName, ProjectLoadError, TableSession, tableFile } from '../play/session.js';
import { promptsFile, PROMPTS_SUFFIX } from '../play/tableFiles.js';

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

/** What tools and routes say before a workspace that started empty has any projects. */
export const NO_PROJECT_YET =
  'Trayful has no project yet. Connect a repository first: on the page in the browser, or with connect_repository.';

export interface WorkspaceOptions {
  /** Reload projects when their files change. Default true. */
  watch?: boolean;
  saveDelayMs?: number;
  /** Hold each agent change until people watching have seen it play out. Default true. */
  agentPace?: boolean;
  /** Where players are kept. Default: `.trayful/players.json` in the base folder. */
  playerStore?: PlayerStore;
  /**
   * Called with a new project's id before its folder is written, such as for a
   * git-backed Trayful to check the folder out.
   */
  beforeNewProject?: (id: string) => Promise<void>;
}

/** Which project and table to open first, and how to make the table if it is new. */
export interface OpenOptions extends WorkspaceOptions {
  project?: string;
  table?: string;
  seed?: number;
  setup?: string | false;
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
 * The projects Trayful serves and their open tables. The root is a base folder whose
 * sub-folders are the projects; started on one project's folder, the base is the
 * folder it is in. Files are watched, so edits show up on open tables at once, and a
 * project folder that appears in the base joins the workspace.
 */
export class Workspace {
  private entries = new Map<string, ProjectEntry>();
  private sessions = new Map<string, TableSession>();
  private opening = new Map<string, Promise<TableSession>>();
  private watchers: FSWatcher[] = [];
  private timers = new Map<string, NodeJS.Timeout>();
  private listeners = new Set<(entry: ProjectEntry) => void>();
  private attachListeners = new Set<() => void>();
  private activeTable: TableSession | undefined;
  private rootDir = '';
  private watched = new Set<string>();
  private notesNow: string[] = [];

  private constructor(
    private readonly options: WorkspaceOptions,
    /** Everyone who has played here, shared by all tables. */
    readonly players: Players,
  ) {}

  /** The base folder the projects are in. Empty until attached. */
  get root(): string {
    return this.rootDir;
  }

  /** What the person should know about how this workspace was opened, such as moved files. */
  get notes(): readonly string[] {
    return this.notesNow;
  }

  /** The table agents play on unless they open another. */
  get active(): TableSession {
    if (!this.activeTable) throw new ProjectLoadError(NO_PROJECT_YET);
    return this.activeTable;
  }

  set active(session: TableSession) {
    this.activeTable = session;
  }

  /** Whether a project is open yet. Only a workspace started empty has none. */
  get ready(): boolean {
    return this.activeTable !== undefined;
  }

  /** Opens a base folder of projects, or one project's folder and the projects beside it. */
  static async open(dir: string, options: OpenOptions = {}): Promise<Workspace> {
    const { base, project } = resolveBase(dir, options.project);
    const notes: string[] = [];
    // Only a folder that has projects becomes a base; starting anywhere else fails below.
    if (!options.playerStore && (await projectDirs(base)).length > 0) {
      await markBase(base);
      const note = project ? await adoptPlayers(base, project) : undefined;
      if (note) notes.push(note);
    }
    const players = await Players.open(options.playerStore ?? FilePlayerStore.in(base));
    const workspace = new Workspace(options, players);
    workspace.notesNow = notes;
    await workspace.attach(base, { ...options, project });
    return workspace;
  }

  /**
   * A workspace with no projects yet, such as a server waiting to be pointed at a
   * repository. Tools and routes that need a table say so until `attach` gives it one.
   */
  static async empty(options: WorkspaceOptions & { playerStore: PlayerStore }): Promise<Workspace> {
    return new Workspace(options, await Players.open(options.playerStore));
  }

  /**
   * Loads the projects in `root` and opens the first table. A workspace is attached
   * once: `open` does it, or a later call on an `empty` one.
   */
  async attach(dir: string, options: OpenOptions = {}): Promise<void> {
    if (this.activeTable) throw new ProjectLoadError('Trayful already has its projects.');
    const { base: root, project } = resolveBase(dir, options.project);
    for (const projectDir of await projectDirs(root)) {
      await this.load(path.basename(projectDir), projectDir);
    }

    const entries = this.projects();
    if (entries.length === 0) {
      throw new ProjectLoadError(
        `No Trayful project in ${root}: none of its folders has a ${MANIFEST_FILE}. ` +
          'Start one with `trayful new <folder>`.',
      );
    }
    const wanted = project ?? entries.find((e) => e.project)?.id ?? entries[0]!.id;
    const entry = this.entry(wanted);
    if (!entry.project) {
      throw new ProjectLoadError(
        `The project in ${entry.dir} has errors:\n  ${entry.problems.join('\n  ')}`,
      );
    }
    this.rootDir = root;
    this.activeTable = await this.table(entry.id, options.table ?? DEFAULT_TABLE, {
      seed: options.seed,
      setup: options.setup,
    });
    if (this.options.watch ?? true) this.watchAll();
    for (const listener of this.attachListeners) listener();
  }

  /** Called once projects are attached to a workspace that started empty. */
  onAttach(listener: () => void): void {
    this.attachListeners.add(listener);
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
      agentPace: this.options.agentPace,
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
        // Open prompts are kept beside a table, in `<name>.prompts.json`.
        if (file.endsWith('.json') && !file.endsWith(PROMPTS_SUFFIX)) {
          names.add(file.slice(0, -'.json'.length));
        }
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
    await rm(promptsFile(project, name), { force: true });
  }

  /** Makes a new project from the starter template, in a new folder of the base. */
  async createProject(name: string): Promise<ProjectEntry> {
    const id = slugify(name);
    if (!id) throw new ProjectLoadError(`"${name}" does not make a usable folder name.`);
    const dir = path.join(this.root, id);
    if (existsSync(dir)) throw new ProjectLoadError(`There is already a folder "${id}".`);
    await this.options.beforeNewProject?.(id);
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

  /** Saves every open table now, rather than after the usual short wait. */
  async saveAll(): Promise<void> {
    for (const session of this.sessions.values()) await session.save();
  }

  /** Reloads every project, such as after new commits came in from a repository. */
  async reloadAll(): Promise<void> {
    for (const entry of this.projects()) await this.load(entry.id, entry.dir);
    await this.rescan();
  }

  /** Takes in project folders that appeared in the base since it was opened. Returns them. */
  async rescan(): Promise<ProjectEntry[]> {
    const added: ProjectEntry[] = [];
    // A workspace that started empty has no base folder to look in yet.
    if (!this.rootDir) return added;
    for (const dir of await projectDirs(this.rootDir)) {
      const id = path.basename(dir);
      if (this.entries.has(id)) continue;
      const entry = await this.load(id, dir);
      if (this.options.watch ?? true) this.watch(entry);
      added.push(entry);
    }
    return added;
  }

  /** Renames a player, and shows the new name at every open table. */
  async renamePlayer(id: string, name: string): Promise<Player> {
    const player = await this.players.rename(id, name);
    for (const session of this.sessions.values()) session.broadcastPlayers();
    return player;
  }

  /** Sends an engine away from every table it was let into. */
  async dismissEngine(id: string): Promise<void> {
    await this.players.dismiss(id);
    for (const session of this.sessions.values()) session.broadcastPlayers();
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
    this.watchBase();
  }

  /** Watches the base itself, one level deep, for project folders that are added. */
  private watchBase(): void {
    const key = '\u0000base';
    try {
      const watcher = watch(this.rootDir, (_event, file) => {
        if (file?.startsWith('.')) return;
        clearTimeout(this.timers.get(key));
        this.timers.set(
          key,
          setTimeout(() => void this.rescan().catch(() => undefined), 150),
        );
      });
      this.watchers.push(watcher);
    } catch {
      // As for projects: without watching, new folders show up after a restart.
    }
  }

  private watch(entry: ProjectEntry): void {
    // A folder made by New project can also be found by the base's watcher first.
    if (this.watched.has(entry.id)) return;
    this.watched.add(entry.id);
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
