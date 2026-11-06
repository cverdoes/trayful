import { randomUUID } from 'node:crypto';
import {
  checkAnswer,
  checkPrompt,
  PromptError,
  type PlayerPrompt,
  type PromptAnswer,
  type PromptRequest,
} from '@trayful/core';
import type { EventFeed } from './feed.js';

/** Why a prompt stopped waiting for answers. */
export type CloseReason = 'answered' | 'cancelled' | 'expired';

/** A prompt and how far its players have got with it, as whoever asked may see it. */
export interface PromptStatus {
  prompt: PlayerPrompt;
  /** The players it is for. */
  to: string[];
  /** `all` waits for everyone it is for; `first` closes on the first answer. */
  until: 'all' | 'first';
  /** The answers in so far, by player. */
  answers: Record<string, PromptAnswer>;
  open: boolean;
  closed?: CloseReason;
}

/** How a prompt is asked, besides what it says. */
export interface AskOptions {
  until?: 'all' | 'first';
  /** Seconds until it closes by itself, if nobody has answered by then. */
  expires?: number;
}

/** How many closed prompts a table remembers, so whoever asked can still read the answers. */
const KEEP_CLOSED = 50;

/**
 * The prompts asked at one table. Each player answers once; a prompt closes when the
 * players it waits for have answered, when it is withdrawn, or when it expires. Every
 * answer and closing goes into the table's event feed. `changed` hears which players'
 * lists changed; `reach` throws when a prompt names something its players cannot see.
 */
export class PromptBoard {
  private prompts = new Map<string, PromptStatus>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly feed: EventFeed,
    private readonly changed: (players: readonly string[]) => void,
    private readonly reach: (request: PromptRequest, to: readonly string[]) => void = noCheck,
  ) {}

  /** Asks players something. `from` is the name shown as asking. */
  ask(
    request: PromptRequest,
    to: readonly string[],
    from: string,
    options: AskOptions = {},
  ): PromptStatus {
    checkPrompt(request);
    if (to.length === 0) throw new PromptError('Say which players the prompt is for.');
    if (options.expires !== undefined && (Number.isNaN(options.expires) || options.expires <= 0)) {
      throw new PromptError('A prompt expires a number of seconds from now, more than 0.');
    }
    const players = [...new Set(to)];
    this.reach(request, players);
    const expires =
      options.expires === undefined
        ? undefined
        : new Date(Date.now() + options.expires * 1000).toISOString();
    const prompt: PlayerPrompt = {
      ...request,
      id: randomUUID().slice(0, 8),
      from,
      ...(expires ? { expires } : {}),
    };
    const status: PromptStatus = {
      prompt,
      to: players,
      until: options.until ?? 'all',
      answers: {},
      open: true,
    };
    this.add(status);
    this.changed(status.to);
    return status;
  }

  /** Takes a player's answer, once it fits the prompt. Stand-in ids must be real ones by now. */
  answer(player: string, id: string, answer: PromptAnswer): void {
    const status = this.prompts.get(id);
    if (!status?.open || !status.to.includes(player) || answered(status, player)) {
      throw new PromptError('That prompt is no longer waiting for your answer.');
    }
    checkAnswer(status.prompt, answer);
    status.answers[player] = answer;
    this.feed.push({ kind: 'answered', prompt: id, player, answer });
    const done = status.until === 'first' || status.to.every((p) => answered(status, p));
    if (done) this.close(status, 'answered');
    else this.changed([player]);
  }

  /** Withdraws a prompt nobody needs to answer any more. */
  cancel(id: string): PromptStatus {
    const status = this.status(id);
    if (status.open) this.close(status, 'cancelled');
    return status;
  }

  status(id: string): PromptStatus {
    const status = this.prompts.get(id);
    if (!status) throw new PromptError(`There is no prompt "${id}".`);
    return status;
  }

  /** Every prompt still open, oldest first, and the latest closed ones after them. */
  list(): PromptStatus[] {
    const all = [...this.prompts.values()];
    return [...all.filter((s) => s.open), ...all.filter((s) => !s.open)];
  }

  /** The prompts a player has still to answer, oldest first. */
  waitingFor(player: string | undefined): PlayerPrompt[] {
    if (!player) return [];
    return [...this.prompts.values()]
      .filter((s) => s.open && s.to.includes(player) && !answered(s, player))
      .map((s) => s.prompt);
  }

  /** The open prompts, to keep with the table so a restart does not lose them. */
  saved(): PromptStatus[] {
    return [...this.prompts.values()].filter((s) => s.open);
  }

  /** Brings back saved open prompts. Those that expired while the table was closed close now. */
  restore(saved: readonly PromptStatus[]): void {
    for (const status of saved) {
      if (status.open && !this.prompts.has(status.prompt.id)) this.add(structuredClone(status));
    }
  }

  /** Stops the expiry timers, when the table closes. */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private add(status: PromptStatus): void {
    this.prompts.set(status.prompt.id, status);
    if (status.prompt.expires) {
      const ms = Math.max(0, Date.parse(status.prompt.expires) - Date.now());
      const timer = setTimeout(() => status.open && this.close(status, 'expired'), ms);
      this.timers.set(status.prompt.id, timer);
    }
    this.forgetOldest();
  }

  private close(status: PromptStatus, reason: CloseReason): void {
    status.open = false;
    status.closed = reason;
    clearTimeout(this.timers.get(status.prompt.id));
    this.timers.delete(status.prompt.id);
    this.feed.push({ kind: 'prompt-closed', prompt: status.prompt.id, reason });
    this.changed(status.to);
  }

  private forgetOldest(): void {
    const closed = [...this.prompts.values()].filter((s) => !s.open);
    for (const status of closed.slice(0, Math.max(0, closed.length - KEEP_CLOSED))) {
      this.prompts.delete(status.prompt.id);
    }
  }
}

function answered(status: PromptStatus, player: string): boolean {
  return Object.hasOwn(status.answers, player);
}

/** For a board that need not check what its prompts name, such as in tests. */
function noCheck(): void {
  // Everything is in reach.
}
