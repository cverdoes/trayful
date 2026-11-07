import type {
  Command,
  EngineMessage,
  PlayerInfo,
  PlayerPrompt,
  PromptAnswer,
  PromptRequest,
  TableEvent,
  TableMessage,
  TableView,
} from './protocol.js';

/** What an engine the host let in connects with. Keep the secret: it works until the host sends the engine away. */
export interface Credentials {
  /** The server's address, such as `http://127.0.0.1:4317`. */
  url: string;
  project: string;
  table: string;
  /** The engine's player id. */
  player: string;
  secret: string;
  /** Whether the host let it see everything, every hand included. */
  fullView: boolean;
}

/** Why a knock did not let the engine in. */
export type RefusalReason = 'denied' | 'expired' | 'busy' | 'invalid';

/** The host did not let the engine in, or could not be asked. */
export class KnockRefused extends Error {
  constructor(
    message: string,
    readonly reason: RefusalReason,
  ) {
    super(message);
    this.name = 'KnockRefused';
  }
}

/** Why a knock comes back, by HTTP status. */
const REFUSALS: Record<number, RefusalReason> = { 403: 'denied', 408: 'expired', 429: 'busy' };

/**
 * Asks the host to let an engine into a table, and waits (up to a minute and a half)
 * for their answer. Leave out `project` and `table` for the table the host has open.
 */
export async function knock(
  url: string,
  name: string,
  where: { project?: string; table?: string } = {},
): Promise<Credentials> {
  let base = url;
  while (base.endsWith('/')) base = base.slice(0, -1);
  const response = await fetch(`${base}/api/knock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, ...where }),
  });
  const body = (await response.json()) as {
    error?: string;
    project?: string;
    table?: string;
    player?: { id: string };
    secret?: string;
    fullView?: boolean;
  };
  if (!response.ok || !body.player || !body.secret) {
    const reason = REFUSALS[response.status] ?? 'invalid';
    throw new KnockRefused(body.error ?? response.statusText, reason);
  }
  return {
    url: base,
    project: body.project!,
    table: body.table!,
    player: body.player.id,
    secret: body.secret,
    fullView: body.fullView === true,
  };
}

/** What a connection tells its listeners about, and what each listener gets. */
export interface TableEvents {
  /** The table changed (or the engine just connected): the whole table as the engine sees it. */
  state: Extract<TableMessage, { type: 'state' }>;
  /** Something happened at the table: a move, an answer, a prompt closing, someone coming or going. */
  event: TableEvent;
  /** Who is at the table. */
  players: PlayerInfo[];
  /** An error the server reported that belongs to no request of the client's. */
  error: string;
  /** The connection closed, such as when the host sent the engine away. */
  close: { code: number; reason: string };
}

type Listener<K extends keyof TableEvents> = (value: TableEvents[K]) => void;

/** How a prompt ended, and what each player answered. */
export interface PromptResult {
  reason: 'answered' | 'cancelled' | 'expired';
  answers: Record<string, PromptAnswer>;
}

/** How many closed prompts a connection keeps the results of, for `answers` called late. */
const KEEP_RESULTS = 100;

interface Pending {
  resolve: (message: TableMessage) => void;
  reject: (error: Error) => void;
}

/**
 * An engine's live connection to one table. It follows the table from the start,
 * keeps the latest state and player list, and turns requests into promises: a
 * command resolves once applied, a prompt once asked, and `answers` once it closes.
 */
export class TableConnection {
  /** The table as the engine last saw it. */
  state: TableView;
  players: PlayerInfo[] = [];
  /** The `seq` of the last event heard; pass it as `since` when connecting again. */
  next = 0;

  private listeners = new Map<keyof TableEvents, Set<(value: never) => void>>();
  private pending = new Map<string, Pending>();
  private requests = 0;
  private answersSoFar = new Map<string, Record<string, PromptAnswer>>();
  private results = new Map<string, PromptResult>();
  private waiting = new Map<string, ((result: PromptResult) => void)[]>();

  private constructor(
    private readonly socket: WebSocket,
    first: Extract<TableMessage, { type: 'state' }>,
  ) {
    this.state = first.state;
    socket.addEventListener('message', ({ data }) => this.receive(String(data)));
    socket.addEventListener('close', ({ code, reason }) => this.closed(code, reason));
  }

  /**
   * Connects to the table the credentials are for. It follows the table's events from
   * `since` (the `next` of an earlier connection), or from now.
   */
  static open(
    credentials: Credentials,
    options: { since?: number } = {},
  ): Promise<TableConnection> {
    const query = new URLSearchParams({ project: credentials.project, table: credentials.table });
    const url = `${credentials.url.replace(/^http/, 'ws')}/ws?${query.toString()}`;
    const socket = new WebSocket(url, {
      headers: { authorization: `Bearer ${credentials.player}:${credentials.secret}` },
    });
    return new Promise((resolve, reject) => {
      const early: TableMessage[] = [];
      const onMessage = ({ data }: MessageEvent) => {
        const message = JSON.parse(String(data)) as TableMessage;
        if (message.type !== 'state') {
          early.push(message);
          return;
        }
        socket.removeEventListener('message', onMessage);
        const connection = new TableConnection(socket, message);
        for (const m of early) connection.handle(m);
        connection.send({
          type: 'follow',
          ...(options.since === undefined ? {} : { since: options.since }),
        });
        resolve(connection);
      };
      socket.addEventListener('message', onMessage);
      socket.addEventListener('error', () =>
        reject(new Error(`Could not connect to ${url}. Has the host sent this engine away?`)),
      );
      // Closed before the table came, such as for a table that does not exist. (Once
      // the connection is open, rejecting again does nothing.)
      socket.addEventListener('close', ({ reason }) =>
        reject(new Error(`The table closed the connection: ${reason || 'no reason given'}.`)),
      );
    });
  }

  /** Listens for something the table tells the engine. Returns a function that stops listening. */
  on<K extends keyof TableEvents>(kind: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(kind) ?? new Set();
    set.add(listener);
    this.listeners.set(kind, set);
    return () => set.delete(listener);
  }

  /** Changes the table. Resolves once the change is made; rejects with the server's reason if it cannot be. */
  async command(command: Command): Promise<void> {
    await this.request((requestId) => ({ type: 'command', command, requestId }));
  }

  /**
   * Asks players something: player ids, or `everyone` (every person at the table).
   * Resolves with the prompt as they are shown it, once it is up.
   */
  async ask(
    to: string[] | 'everyone',
    prompt: PromptRequest,
    options: { until?: 'all' | 'first'; expires?: number } = {},
  ): Promise<PlayerPrompt & { to: string[] }> {
    const asked = (await this.request((requestId) => ({
      type: 'ask',
      to,
      prompt,
      ...options,
      requestId,
    }))) as Extract<TableMessage, { type: 'asked' }>;
    return { ...asked.prompt, to: asked.to };
  }

  /** Waits for a prompt the engine asked to close, and gives what each player answered. */
  answers(prompt: string): Promise<PromptResult> {
    const done = this.results.get(prompt);
    if (done) return Promise.resolve(done);
    return new Promise((resolve) => {
      this.waiting.set(prompt, [...(this.waiting.get(prompt) ?? []), resolve]);
    });
  }

  /** Withdraws a prompt the engine asked. */
  cancel(prompt: string): void {
    this.send({ type: 'cancel-prompt', prompt });
  }

  /** Undoes the engine's own last change. */
  undo(): void {
    this.send({ type: 'undo' });
  }

  redo(): void {
    this.send({ type: 'redo' });
  }

  /** Sends any message the table understands, for what the methods above do not cover. */
  send(message: EngineMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close();
  }

  private request(build: (requestId: string) => EngineMessage): Promise<TableMessage> {
    const requestId = `r${++this.requests}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.send(build(requestId));
    });
  }

  private receive(data: string): void {
    this.handle(JSON.parse(data) as TableMessage);
  }

  private handle(message: TableMessage): void {
    switch (message.type) {
      case 'state':
        this.state = message.state;
        this.emit('state', message);
        break;
      case 'players':
        this.players = message.players;
        this.emit('players', message.players);
        break;
      case 'events':
        for (const event of message.events) this.heard(event);
        this.next = Math.max(this.next, message.next);
        break;
      case 'done':
      case 'asked':
      case 'error':
        this.settle(message);
        break;
      default:
        // Prompts for the engine's own player, pictures and project changes are for browsers.
        break;
    }
  }

  /** Hands a reply to the request it answers, or reports an error that answers none. */
  private settle(message: Extract<TableMessage, { type: 'done' | 'asked' | 'error' }>): void {
    const pending = message.requestId ? this.pending.get(message.requestId) : undefined;
    if (!pending) {
      if (message.type === 'error') this.emit('error', message.message);
      return;
    }
    this.pending.delete(message.requestId!);
    if (message.type === 'error') pending.reject(new Error(message.message));
    else pending.resolve(message);
  }

  private heard(event: TableEvent): void {
    this.next = Math.max(this.next, event.seq);
    if (event.kind === 'answered') {
      const answers = this.answersSoFar.get(event.prompt) ?? {};
      answers[event.player] = event.answer;
      this.answersSoFar.set(event.prompt, answers);
    } else if (event.kind === 'prompt-closed') {
      this.promptClosed(event.prompt, {
        reason: event.reason,
        answers: this.answersSoFar.get(event.prompt) ?? {},
      });
    }
    this.emit('event', event);
  }

  private promptClosed(prompt: string, result: PromptResult): void {
    this.answersSoFar.delete(prompt);
    this.results.set(prompt, result);
    if (this.results.size > KEEP_RESULTS) this.results.delete(this.results.keys().next().value!);
    for (const resolve of this.waiting.get(prompt) ?? []) resolve(result);
    this.waiting.delete(prompt);
  }

  private closed(code: number, reason: string): void {
    for (const { reject } of this.pending.values()) reject(new Error('The connection closed.'));
    this.pending.clear();
    this.emit('close', { code, reason });
  }

  private emit<K extends keyof TableEvents>(kind: K, value: TableEvents[K]): void {
    for (const listener of this.listeners.get(kind) ?? []) (listener as Listener<K>)(value);
  }
}
