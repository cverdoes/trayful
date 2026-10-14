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
}

/** Everything the registry keeps between runs. */
export interface PlayersData {
  /** The secret in invite links. Anyone holding it may join as a guest. */
  invite: string;
  players: StoredPlayer[];
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

const COLORS = [
  '#e4572e',
  '#29335c',
  '#17bebb',
  '#ffc914',
  '#76b041',
  '#a23b72',
  '#f18f01',
  '#6c757d',
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
    const data = (await store.load()) ?? { invite: secret(16), players: [] };
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

  get invite(): string {
    return this.data.invite;
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
export function hostName(): string {
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

function publicPlayer({ secretHash: _secret, ...player }: StoredPlayer): Player {
  return player;
}

function secret(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function hash(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
