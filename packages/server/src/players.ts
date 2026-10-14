import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Someone at the table: a person in a browser, or an agent over MCP. */
export interface Player {
  /** Lowercase letters, digits and dashes; used in `hand:<id>` targets. */
  id: string;
  name: string;
  color: string;
  kind: 'person' | 'agent';
  /** The host runs the server; guests joined through an invite link. */
  role: 'host' | 'guest' | 'agent';
}

interface StoredPlayer extends Player {
  secretHash: string;
  /** Tables a guest was invited to, as `project/table`. */
  tables?: string[];
}

/** An invite to one table. Anyone holding its token may join that table as a guest. */
export interface Invite {
  token: string;
  project: string;
  table: string;
}

/** Everything the registry keeps between runs. */
export interface PlayersData {
  invites: Invite[];
  players: StoredPlayer[];
}

/** How a table is named in invites and grants: `project/table`. */
export function tableKey(project: string, table: string): string {
  return `${project}/${table}`;
}

/**
 * Where players are kept. The file store suits one person's computer; a hosted
 * service would keep them in a database behind the same two calls.
 */
export interface PlayerStore {
  load(): Promise<PlayersData | undefined>;
  save(data: PlayersData): Promise<void>;
}

/** Keeps players in `<root>/.trayful/players.json`. */
export class FilePlayerStore implements PlayerStore {
  constructor(readonly file: string) {}

  static in(root: string): FilePlayerStore {
    return new FilePlayerStore(path.join(root, '.trayful', 'players.json'));
  }

  async load(): Promise<PlayersData | undefined> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as PlayersData;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  async save(data: PlayersData): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(tmp, this.file);
  }
}

export class MemoryPlayerStore implements PlayerStore {
  private data: PlayersData | undefined;
  async load() {
    return this.data && structuredClone(this.data);
  }
  async save(data: PlayersData) {
    this.data = structuredClone(data);
  }
}

/** The player agents act as over MCP. */
export const AGENT_PLAYER = 'claude';

// Bright enough to read on the dark toolbar.
const COLORS = [
  '#e4572e',
  '#4ea8de',
  '#17bebb',
  '#ffc914',
  '#76b041',
  '#c77dff',
  '#f18f01',
  '#adb5bd',
];
const MAX_NAME = 40;

export class PlayerError extends Error {}

/** The players of a workspace, and the secrets that prove who is who. */
export class Players {
  private hosting: Promise<Player> | undefined;

  private constructor(
    private data: PlayersData,
    private readonly store: PlayerStore,
  ) {}

  static async open(store: PlayerStore): Promise<Players> {
    const data = (await store.load()) ?? { invites: [], players: [] };
    // Before invites were per table there was one for every table; it no longer works.
    delete (data as { invite?: string }).invite;
    data.invites ??= [];
    const players = new Players(data, store);
    if (!players.get(AGENT_PLAYER)) {
      data.players.push({
        id: AGENT_PLAYER,
        name: 'Claude',
        color: '#d97757',
        kind: 'agent',
        role: 'agent',
        secretHash: '',
      });
    }
    await store.save(data);
    return players;
  }

  /** The invite to a table, made the first time it is asked for. `renew` replaces it. */
  async invite(project: string, table: string, renew = false): Promise<Invite> {
    let invite = this.data.invites.find((i) => i.project === project && i.table === table);
    if (invite && !renew) return invite;
    if (invite) this.data.invites.splice(this.data.invites.indexOf(invite), 1);
    invite = { token: secret(16), project, table };
    this.data.invites.push(invite);
    await this.store.save(this.data);
    return invite;
  }

  /** The invite a token belongs to, if it is still valid. */
  byToken(token: string): Invite | undefined {
    return token ? this.data.invites.find((i) => i.token === token) : undefined;
  }

  /** Lets a player into a table from now on, even if its invite is renewed. */
  async grant(id: string, keys: Iterable<string>): Promise<void> {
    const player = this.data.players.find((p) => p.id === id);
    if (!player) return;
    const tables = new Set([...(player.tables ?? []), ...keys]);
    if (tables.size === (player.tables?.length ?? 0)) return;
    player.tables = [...tables].sort();
    await this.store.save(this.data);
  }

  /** The tables a player was invited to, as `project/table`. */
  tablesOf(id: string): string[] {
    return this.data.players.find((p) => p.id === id)?.tables ?? [];
  }

  list(): Player[] {
    return this.data.players.map(publicPlayer);
  }

  get(id: string): Player | undefined {
    const player = this.data.players.find((p) => p.id === id);
    return player && publicPlayer(player);
  }

  /** Adds a player and returns the secret they prove themselves with from now on. */
  async join(name: string, role: 'host' | 'guest'): Promise<{ player: Player; secret: string }> {
    const clean = cleanName(name);
    const base = slug(clean) || role;
    let id = base;
    for (let n = 2; this.data.players.some((p) => p.id === id); n++) id = `${base}-${n}`;
    const key = secret(24);
    const stored: StoredPlayer = {
      id,
      name: clean,
      color: COLORS[this.data.players.filter((p) => p.kind === 'person').length % COLORS.length]!,
      kind: 'person',
      role,
      secretHash: hash(key),
    };
    this.data.players.push(stored);
    await this.store.save(this.data);
    return { player: publicPlayer(stored), secret: key };
  }

  /**
   * The person running the server. Requests from this computer act as them without a
   * cookie, so the secret made here is never handed out.
   */
  host(): Promise<Player> {
    const host = this.data.players.find((p) => p.role === 'host');
    if (host) return Promise.resolve(publicPlayer(host));
    // The page and its socket ask at the same time; make one host, not two.
    this.hosting ??= this.join(hostName(), 'host').then(({ player }) => player);
    return this.hosting;
  }

  /** The player a secret belongs to, or nothing. */
  authenticate(id: string, key: string): Player | undefined {
    const player = this.data.players.find((p) => p.id === id);
    if (!player?.secretHash || !key) return undefined;
    const a = Buffer.from(player.secretHash, 'hex');
    const b = Buffer.from(hash(key), 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? publicPlayer(player) : undefined;
  }

  async rename(id: string, name: string): Promise<Player> {
    const player = this.data.players.find((p) => p.id === id);
    if (!player) throw new PlayerError(`No player "${id}".`);
    player.name = cleanName(name);
    await this.store.save(this.data);
    return publicPlayer(player);
  }
}

/** A name for the person running the server, from their account on this computer. */
function hostName(): string {
  try {
    const name = os.userInfo().username;
    return name ? name[0]!.toUpperCase() + name.slice(1) : 'Host';
  } catch {
    return 'Host';
  }
}

function cleanName(name: unknown): string {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
  if (!clean) throw new PlayerError('Give a name to join with.');
  return clean;
}

function slug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
}

function publicPlayer({ secretHash: _secret, tables: _tables, ...player }: StoredPlayer): Player {
  return player;
}

function secret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
