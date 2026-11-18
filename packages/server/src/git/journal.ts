// Who changed what since the last commit, so Trayful's commit messages say it.

/** One change: who made it (a player's name, or "agent") and what they used. */
interface Note {
  who: string;
  what: string;
}

const FALLBACK = 'Trayful: save changes';
/** Git shows the first line of a message on its own; keep it to a glance. */
const SUBJECT_LENGTH = 72;

/**
 * Collects the changes made since the last commit, such as "upsert_type" by an
 * agent or "Tray" by a player, and turns them into a commit message.
 */
export class Journal {
  private notes: Note[] = [];

  note(who: string, what: string): void {
    if (!this.notes.some((n) => n.who === who && n.what === what)) this.notes.push({ who, what });
  }

  /**
   * A message such as "Trayful: upsert_type, add_asset (agent); Tray (Claes)", with
   * each change on a line of its own below when the first line gets long.
   */
  message(): string {
    if (this.notes.length === 0) return FALLBACK;
    const byWho = new Map<string, string[]>();
    for (const { who, what } of this.notes) byWho.set(who, [...(byWho.get(who) ?? []), what]);
    const parts = [...byWho].map(([who, whats]) => `${whats.join(', ')} (${who})`);
    const subject = `Trayful: ${parts.join('; ')}`;
    if (subject.length <= SUBJECT_LENGTH) return subject;
    const lines = this.notes.map(({ who, what }) => `- ${what} (${who})`);
    return [`Trayful: changes by ${[...byWho.keys()].join(', ')}`, '', ...lines].join('\n');
  }

  clear(): void {
    this.notes = [];
  }
}
