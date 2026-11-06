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

/** A prompt and how far its players have got with it, as whoever asked may see it. */
export interface PromptStatus {
  prompt: PlayerPrompt;
  /** The players it is for. */
  to: string[];
  /** The answers in so far, by player. */
  answers: Record<string, PromptAnswer>;
  open: boolean;
}

/** How many closed prompts a table remembers, so whoever asked can still read the answers. */
const KEEP_CLOSED = 50;

/**
 * The prompts asked at one table. Each player answers once; a prompt closes when
 * everyone it is for has answered, or when it is withdrawn. Every answer and closing
 * goes into the table's event feed. `changed` hears which players' lists changed.
 */
export class PromptBoard {
  private prompts = new Map<string, PromptStatus>();

  constructor(
    private readonly feed: EventFeed,
    private readonly changed: (players: readonly string[]) => void,
  ) {}

  /** Asks players something. `from` is the name shown as asking. */
  ask(request: PromptRequest, to: readonly string[], from: string): PromptStatus {
    checkPrompt(request);
    if (to.length === 0) throw new PromptError('Say which players the prompt is for.');
    const prompt: PlayerPrompt = { ...request, id: randomUUID().slice(0, 8), from };
    const status: PromptStatus = { prompt, to: [...new Set(to)], answers: {}, open: true };
    this.prompts.set(prompt.id, status);
    this.forgetOldest();
    this.changed(status.to);
    return status;
  }

  /** Takes a player's answer, once it fits the prompt. */
  answer(player: string, id: string, answer: PromptAnswer): void {
    const status = this.prompts.get(id);
    if (!status?.open || !status.to.includes(player) || answered(status, player)) {
      throw new PromptError('That prompt is no longer waiting for your answer.');
    }
    checkAnswer(status.prompt, answer);
    status.answers[player] = answer;
    this.feed.push({ kind: 'answered', prompt: id, player, answer });
    if (status.to.every((p) => answered(status, p))) this.close(status, 'answered');
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

  private close(status: PromptStatus, reason: 'answered' | 'cancelled'): void {
    status.open = false;
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
