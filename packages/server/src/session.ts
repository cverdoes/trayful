import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AliasBook,
  CommandError,
  handCounts,
  HAND_PREFIX,
  HIDDEN_PREFIX,
  resolveAliases,
  viewFor,
  type Command,
  type PlayerInfo,
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
import { activityText } from './activity.js';
import { AGENT_PLAYER, type Player } from './players.js';

export class ProjectLoadError extends Error {}

/** A snapshot could not be taken, usually because no browser has the table open. */
export class SnapshotError extends Error {}

const TABLE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The players a table may name. A workspace hands its `Players` registry here. */
export interface PlayerDirectory {
  get(id: string): Player | undefined;
}

/** An agent counts as at the table this long after it last acted. */
const AGENT_ONLINE_MS = 5 * 60_000;

type Listener = (message: ServerMessage) => void;

export interface SessionOptions {
  seed?: number;
  setup?: string | false;
  saveDelayMs?: number;
  version?: number;
  players?: PlayerDirectory;
}

/**
 * One open table: the loaded project, its engine and its file on disk.
 * Every client message goes through `handle`, and every change is saved
 * to `tables/<name>.json` shortly after it happens.
 */
export class TableSession {
  private revision = 0;
  /** Who is watching, and as which player (none for a spectator who sees no hand). */
  private listeners = new Map<Listener, string | undefined>();
  private aliases = new AliasBook(() => randomBytes(5).toString('hex'));
  /** Players who have been at this table, and when they last acted. */
  private seen = new Map<string, number>();
  private players: PlayerDirectory | undefined;
  private saveTimer: NodeJS.Timeout | undefined;
  private saving: Promise<void> = Promise.resolve();
  private activity: Activity | undefined;
  private snapshots = new Map<
    string,
    { resolve: (png: Buffer) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  private readonly saveDelayMs: number;
  private version: number;

  private constructor(
    private current: ResolvedProject,
    readonly tableName: string,
    readonly engine: TableEngine,
    options: SessionOptions,
  ) {
    this.saveDelayMs = options.saveDelayMs ?? 250;
    this.version = options.version ?? 1;
    this.players = options.players;
    engine.subscribe((state, change) => {
      this.revision++;
      // After a shuffle, an undo or a whole new table nobody may follow a hidden piece
      // by its stand-in id, so those get new ones.
      if (change.kind !== 'apply' || change.command.type === 'replace') this.aliases.clear();
      else if (change.command.type === 'shuffle') {
        const stack = state.objects[change.command.id];
        if (stack?.kind === 'stack') this.aliases.forget(stack.items);
      }
      this.aliases.prune(state);
      for (const [listener, viewer] of this.listeners) listener(this.stateMessage(viewer));
      this.scheduleSave();
    });
  }

  /** Loads a project and opens (or creates) one of its tables. */
  static async open(
    projectDir: string,
    tableName = 'table-1',
    options: SessionOptions = {},
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
    options: SessionOptions = {},
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
      options,
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
      assets: this.project.assets,
      legacy: this.project.legacy,
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

  /** The table as one player may see it. */
  stateMessage(viewer?: string): ServerMessage {
    return {
      type: 'state',
      state: this.viewFor(viewer),
      revision: this.revision,
      // Each player undoes only their own changes.
      canUndo: this.engine.canUndoFor(viewer),
      canRedo: this.engine.canRedoFor(viewer),
      ...(this.activity ? { activity: this.activity } : {}),
    };
  }

  /** The table as one player may see it: other hands and face-down faces hidden. */
  viewFor(viewer: string | undefined) {
    return viewFor(this.engine.state, viewer, this.aliases, this.project.types);
  }

  /** Makes a change on behalf of an agent, labelled so people watching see what it did. */
  asAgent<T>(text: string, change: () => T): T {
    return this.as(AGENT_PLAYER, text, change);
  }

  /** Makes a change on behalf of a player, labelled with who did it and what. */
  as<T>(player: string | undefined, text: string, change: () => T): T {
    const agent = player === AGENT_PLAYER;
    const first = player !== undefined && !this.seen.has(player);
    if (player) this.seen.set(player, Date.now());
    if (first) this.broadcastPlayers();
    this.activity = {
      by: agent ? 'agent' : 'person',
      ...(player ? { player, name: this.players?.get(player)?.name ?? player } : {}),
      text,
    };
    try {
      return change();
    } finally {
      this.activity = undefined;
    }
  }

  /**
   * Checks that a player may make a command, and applies it. Stand-in ids of hidden
   * pieces are swapped for the real ones; pieces in other players' hands are out of reach.
   */
  act(player: string | undefined, command: Command): void {
    const real = resolveAliases(command, this.aliases);
    this.checkReach(real, player);
    const name = (id: string) =>
      id === player ? 'their' : `${this.players?.get(id)?.name ?? id}'s`;
    this.as(player, activityText(real, name), () => this.engine.dispatch(real, player));
  }

  /** Throws when a command names a piece out of the player's reach, or an unknown player. */
  checkReach(value: unknown, player: string | undefined): void {
    if (typeof value === 'string') this.checkReference(value, player);
    else if (Array.isArray(value)) for (const v of value) this.checkReach(v, player);
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) this.checkReach(v, player);
    }
  }

  /** Checks one string in a command, which may name a piece, a snap spot or a hand. */
  private checkReference(value: string, player: string | undefined): void {
    const id = value.split('/')[0]!;
    if (id.startsWith(HIDDEN_PREFIX)) {
      throw new CommandError(
        'That hidden piece is no longer where you saw it (it was shuffled or moved). Look at the table again.',
      );
    }
    const object = this.engine.state.objects[id];
    if (object?.kind === 'piece' && object.hand && object.hand !== player) {
      throw new CommandError("That piece is in another player's hand.");
    }
    const owner = value.startsWith(HAND_PREFIX) ? value.slice(HAND_PREFIX.length) : undefined;
    if (owner !== undefined && this.players && !this.players.get(owner)) {
      throw new CommandError(`There is no player "${owner}".`);
    }
  }

  /** Who is at this table: everyone watching, holding pieces, or who has acted here. */
  roster(): PlayerInfo[] {
    const watching = new Set(this.listeners.values());
    const ids = new Set([
      ...watching,
      ...this.seen.keys(),
      ...Object.keys(handCounts(this.engine.state)),
    ]);
    const now = Date.now();
    const infos: PlayerInfo[] = [];
    for (const id of ids) {
      if (!id) continue;
      const player = this.players?.get(id) ?? {
        id,
        name: id,
        color: '#6c757d',
        kind: id === AGENT_PLAYER ? 'agent' : 'person',
        role: id === AGENT_PLAYER ? 'agent' : 'guest',
      };
      const online =
        watching.has(id) ||
        (player.kind === 'agent' && now - (this.seen.get(id) ?? 0) < AGENT_ONLINE_MS);
      infos.push({ ...player, online });
    }
    const order = { host: 0, guest: 1, agent: 2 };
    return infos.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
  }

  /** Tells everyone watching who is at the table, for example after someone renamed. */
  broadcastPlayers(): void {
    const players = this.roster();
    for (const [listener, viewer] of this.listeners) {
      listener({ type: 'players', players, ...(viewer ? { you: viewer } : {}) });
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

  /**
   * Applies a client message from a player (or a spectator, who can reach no hand).
   * Returns an error message for the sender only, or nothing on success.
   */
  handle(message: ClientMessage | null, player?: string): ServerMessage | undefined {
    if (message === null || typeof message !== 'object') {
      return { type: 'error', message: 'Messages must be JSON objects with a "type".' };
    }
    try {
      switch (message.type) {
        case 'command':
          this.act(player, message.command);
          return undefined;
        case 'undo':
          this.as(player, 'undid their last change', () => this.engine.undo(player));
          return undefined;
        case 'redo':
          this.as(player, 'redid their change', () => this.engine.redo(player));
          return undefined;
        case 'reset':
          this.as(player, 'started a new table', () =>
            this.reset(message.seed, message.setup, player),
          );
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
  reset(seed?: number, setup?: string | false, player?: string): void {
    this.engine.replace(createTable(this.project, { name: this.tableName, seed, setup }), player);
  }

  /**
   * Sends every change to a listener, as the table looks to `viewer`. Watching
   * players show as online to the others while they are subscribed.
   */
  subscribe(listener: Listener, viewer?: string): () => void {
    this.listeners.set(listener, viewer);
    if (viewer) this.seen.set(viewer, this.seen.get(viewer) ?? 0);
    this.broadcastPlayers();
    return () => {
      this.listeners.delete(listener);
      this.broadcastPlayers();
    };
  }

  private broadcast(message: ServerMessage): void {
    for (const listener of this.listeners.keys()) listener(message);
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
