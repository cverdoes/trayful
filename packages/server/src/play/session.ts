import { randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AliasBook,
  fullView,
  CommandError,
  handCounts,
  PromptError,
  resolveAliases,
  viewFor,
  type Command,
  type PlayerInfo,
  createTable,
  hasSurface,
  keepSeats,
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
import { activityFor, activityText, changedInSight, motionOf } from './activity.js';
import { EventFeed } from './feed.js';
import { PictureRequests, SnapshotError } from './pictures.js';
import { AGENT_PLAYER, tableKey, type PlayerDirectory } from './players.js';
import { PromptBoard } from './prompts.js';
import { rosterOf } from './roster.js';
import { checkPromptReach, checkReach, checkSeating, promptAsSeenBy } from './reach.js';
import { promptsFile, readSavedPrompts, savePrompts, tableFile, writeJson } from './tableFiles.js';

export { SnapshotError } from './pictures.js';
export type { PlayerDirectory } from './players.js';
export { tableFile } from './tableFiles.js';

export class ProjectLoadError extends Error {}

const TABLE_NAME = /^[a-z0-9][a-z0-9-]*$/;

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
  private pictures = new PictureRequests(
    (message) => this.broadcast(message),
    () => this.listeners.size,
  );
  /** What happens at this table, for whatever runs the game to follow. */
  readonly events = new EventFeed();
  /** Questions and messages for players, asked by whatever runs the game. */
  readonly prompts = new PromptBoard(
    this.events,
    (players) => {
      this.sendPrompts(players);
      this.scheduleSave();
    },
    (request, to) => checkPromptReach(this.engine.state, this.project.types, request, to),
  );

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
    let before = engine.state;
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
      this.events.push({
        kind: 'changed',
        change: change.kind,
        ...(this.activity?.player
          ? { player: this.activity.player, name: this.activity.name }
          : {}),
        text: this.activity?.text ?? 'caught up with the project files',
        revision: this.revision,
        objects: changedInSight(before, state),
      });
      before = state;
      for (const [listener, viewer] of this.listeners) listener(this.stateMessage(viewer));
      // Stand-in ids may have changed, and prompts name pieces by them.
      this.sendPrompts(this.playersWaiting());
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

  /** Opens (or creates) a table of a loaded project, brought in line with its files. */
  static async create(
    project: ResolvedProject,
    tableName = 'table-1',
    options: SessionOptions = {},
  ): Promise<TableSession> {
    checkTableName(tableName);
    const file = tableFile(project, tableName);
    let state: TableState;
    try {
      // The project files may have changed while the table was closed.
      state = syncTable(fromTableFile(JSON.parse(await readFile(file, 'utf8'))), project);
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
    session.prompts.restore(await readSavedPrompts(promptsFile(project, tableName)));
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
    const state = this.viewFor(viewer);
    return {
      type: 'state',
      state,
      revision: this.revision,
      // Each player undoes only their own changes.
      canUndo: this.engine.canUndoFor(viewer),
      canRedo: this.engine.canRedoFor(viewer),
      ...(this.activity ? { activity: activityFor(this.activity, state) } : {}),
    };
  }

  /** The table as one player may see it: other hands and face-down faces hidden. */
  viewFor(viewer: string | undefined) {
    if (this.seesEverything(viewer)) return fullView(this.engine.state);
    return viewFor(this.engine.state, viewer, this.aliases, this.project.types);
  }

  /** Whether the host let a player, an engine, see everything at this table. */
  seesEverything(viewer: string | undefined): boolean {
    const key = tableKey(this.projectId, this.tableName);
    return viewer !== undefined && (this.players?.seesEverything?.(viewer, key) ?? false);
  }

  /**
   * Makes a change on behalf of an agent, labelled so people watching see what it did.
   * `commands` are what the change runs, so tables can animate them.
   */
  asAgent<T>(text: string, change: () => T, commands: readonly Command[] = []): T {
    return this.as(AGENT_PLAYER, text, change, commands);
  }

  /** Makes a change on behalf of a player, labelled with who did it and what. */
  as<T>(
    player: string | undefined,
    text: string,
    change: () => T,
    commands: readonly Command[] = [],
  ): T {
    const agent = player === AGENT_PLAYER;
    const first = player !== undefined && !this.seen.has(player);
    if (player) this.seen.set(player, Date.now());
    if (first) this.broadcastPlayers();
    const motion = motionOf(commands);
    this.activity = {
      by: agent ? 'agent' : 'person',
      ...(player ? { player, name: this.players?.get(player)?.name ?? player } : {}),
      text,
      ...(motion ? { motion } : {}),
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
    this.as(player, activityText(real, name), () => this.engine.dispatch(real, player), [real]);
  }

  /** Throws when a command names a piece out of the player's reach, or an unknown player. */
  checkReach(command: unknown, player: string | undefined): void {
    checkReach(this.engine.state, this.players, command, player);
    checkSeating(this.engine.state, this.players, command, player);
  }

  /** Who is at this table: everyone watching, holding pieces, or who has acted here. */
  roster(): PlayerInfo[] {
    const ids = [...this.listeners.values(), ...this.seen.keys()];
    ids.push(...Object.keys(handCounts(this.engine.state)));
    return rosterOf(ids, new Set(this.listeners.values()), this.seen, this.players);
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

  /**
   * Asks the watching browsers to render the whole of a surface (the Centre unless
   * named), and resolves with the first PNG back.
   */
  requestSnapshot(surface?: string, timeoutMs = 10_000): Promise<Buffer> {
    if (surface !== undefined && !hasSurface(this.engine.state, surface))
      return Promise.reject(new SnapshotError(`There is no surface "${surface}".`));
    return this.pictures.request(
      (id) => ({ type: 'snapshot-request', id, ...(surface === undefined ? {} : { surface }) }),
      timeoutMs,
    );
  }

  /** Asks a watching browser to draw one component, and resolves with the PNG. */
  requestRender(component: RenderRequest, timeoutMs = 10_000): Promise<Buffer> {
    return this.pictures.request((id) => ({ type: 'render-request', id, component }), timeoutMs);
  }

  /** The prompts one player has still to answer. */
  promptsMessage(viewer: string | undefined): ServerMessage {
    const prompts = this.prompts.waitingFor(viewer);
    return {
      type: 'prompts',
      prompts: viewer
        ? prompts.map((p) => promptAsSeenBy(p, this.engine.state, viewer, this.aliases))
        : [],
    };
  }

  /** Sends the players named their prompts, when they have some or just had some. */
  private sendPrompts(players: readonly string[]): void {
    for (const [listener, viewer] of this.listeners) {
      if (viewer && players.includes(viewer)) listener(this.promptsMessage(viewer));
    }
  }

  /**
   * Applies a client message from a player (or a spectator, who can reach no hand).
   * Returns a reply for the sender only: an error, `done` for a command with a request id, or nothing.
   */
  handle(message: ClientMessage | null, player?: string): ServerMessage | undefined {
    if (message === null || typeof message !== 'object') {
      return { type: 'error', message: 'Messages must be JSON objects with a "type".' };
    }
    try {
      switch (message.type) {
        case 'command':
          this.act(player, message.command);
          return message.requestId ? { type: 'done', requestId: message.requestId } : undefined;
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
          this.pictures.answer(message.id, message.png, message.error);
          return undefined;
        case 'answer':
          if (!player) throw new PromptError('Join the table to answer.');
          this.prompts.answer(player, message.prompt, resolveAliases(message.answer, this.aliases));
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
        err instanceof CommandError || err instanceof SetupError || err instanceof PromptError
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
   * Players sitting at a seat the new table also has stay seated there.
   */
  reset(seed?: number, setup?: string | false, player?: string): void {
    const fresh = createTable(this.project, { name: this.tableName, seed, setup });
    this.engine.replace(keepSeats(this.engine.state, fresh), player);
  }

  /**
   * Sends every change to a listener, as the table looks to `viewer`. Watching
   * players show as online to the others while they are subscribed.
   */
  subscribe(listener: Listener, viewer?: string): () => void {
    if (viewer && !this.isWatching(viewer)) this.events.push({ kind: 'joined', player: viewer });
    this.listeners.set(listener, viewer);
    if (viewer) this.seen.set(viewer, this.seen.get(viewer) ?? 0);
    this.broadcastPlayers();
    return () => {
      this.listeners.delete(listener);
      // A player may have the table open in several tabs; they leave with the last.
      if (viewer && !this.isWatching(viewer)) this.events.push({ kind: 'left', player: viewer });
      this.broadcastPlayers();
    };
  }

  /** The players watching who have prompts still to answer. */
  private playersWaiting(): string[] {
    return [...this.listeners.values()].filter(
      (v): v is string => this.prompts.waitingFor(v).length > 0,
    );
  }

  private isWatching(player: string): boolean {
    return [...this.listeners.values()].includes(player);
  }

  private broadcast(message: ServerMessage): void {
    for (const listener of this.listeners.keys()) listener(message);
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), this.saveDelayMs);
  }

  /** Writes the table, and the prompts still open beside it, now. */
  save(): Promise<void> {
    clearTimeout(this.saveTimer);
    const state = this.engine.state;
    const open = this.prompts.saved();
    this.saving = this.saving.then(async () => {
      const file = this.file;
      await mkdir(path.dirname(file), { recursive: true });
      await writeJson(file, toTableFile(state));
      await savePrompts(promptsFile(this.project, this.tableName), open);
    });
    return this.saving;
  }

  async close(): Promise<void> {
    this.pictures.cancelAll('The server is stopping.');
    this.prompts.dispose();
    this.events.close();
    await this.save();
    this.listeners.clear();
  }
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
