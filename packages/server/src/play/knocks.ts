import { tableKey, cleanName, type Player, type Players } from './players.js';
import type { TableSession } from './session.js';

/** How an engine's knock ended. On `allowed` it gets the secret it connects with. */
export type KnockOutcome =
  | { status: 'allowed'; player: Player; secret: string; fullView: boolean }
  | { status: 'denied' }
  | { status: 'expired' };

/** Thrown when a knock is turned away before the host is even asked. */
export class KnockError extends Error {}

/** How long the host has to answer, in seconds. Short enough for a tunnel to hold the request. */
const KNOCK_SECONDS = 90;
/** How many engines may knock at one table at once. */
const MAX_KNOCKING = 3;
/** How long an address the host turned away waits before knocking again. */
const TURNED_AWAY_MS = 60_000;

const ALLOW = 'allow';
const FULL_VIEW = 'allow-full-view';

/**
 * Engines asking to join a table. Instead of a token copied by hand, an engine knocks
 * with a name, the host is asked with a prompt (Allow, Allow with full view, Deny), and
 * an engine let in gets its own secret. Only the host sees knocks, one at a time per
 * address, a few at a time per table, so knocking through a tunnel cannot flood them.
 */
export class Knocks {
  /** Addresses knocking now, and tables with the number knocking there. */
  private knocking = new Set<string>();
  private perTable = new Map<string, number>();
  /** Addresses the host turned away, and until when. */
  private turnedAway = new Map<string, number>();

  constructor(
    private readonly players: Players,
    private readonly now: () => number = Date.now,
  ) {}

  /** Asks the host to let an engine in, and waits for their answer. */
  async knock(session: TableSession, name: string, from: string): Promise<KnockOutcome> {
    const clean = cleanName(name);
    const table = tableKey(session.projectId, session.tableName);
    this.checkMayKnock(from, table);
    const host = await this.players.host();
    this.knocking.add(from);
    this.perTable.set(table, (this.perTable.get(table) ?? 0) + 1);
    try {
      const { prompt } = session.prompts.ask(
        {
          kind: 'choice',
          title: 'An engine knocks',
          text: `"${clean}" asks to join this table to run the game. A full view shows it every hand and face-down card.`,
          options: [
            { id: ALLOW, label: 'Allow' },
            { id: FULL_VIEW, label: 'Allow with full view' },
            { id: 'deny', label: 'Deny' },
          ],
        },
        [host.id],
        'Trayful',
        { expires: KNOCK_SECONDS, passing: true },
      );
      const answer = (await session.prompts.settled(prompt.id)).answers[host.id];
      const picked = Array.isArray(answer) ? answer[0] : undefined;
      if (picked === undefined) return { status: 'expired' };
      if (picked !== ALLOW && picked !== FULL_VIEW) {
        this.turnedAway.set(from, this.now() + TURNED_AWAY_MS);
        return { status: 'denied' };
      }
      const full = picked === FULL_VIEW;
      const admitted = await this.players.admitEngine(clean, table, full);
      return { status: 'allowed', ...admitted, fullView: full };
    } finally {
      this.knocking.delete(from);
      this.perTable.set(table, (this.perTable.get(table) ?? 1) - 1);
    }
  }

  private checkMayKnock(from: string, table: string): void {
    if ((this.turnedAway.get(from) ?? 0) > this.now()) {
      throw new KnockError('The host said no a moment ago. Wait a minute before knocking again.');
    }
    if (this.knocking.has(from)) {
      throw new KnockError('You are knocking already. Wait for the host to answer.');
    }
    if ((this.perTable.get(table) ?? 0) >= MAX_KNOCKING) {
      throw new KnockError('Others are knocking at this table. Try again in a minute.');
    }
  }
}
