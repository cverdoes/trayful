import {
  PromptError,
  type ClientMessage,
  type ServerMessage,
  type TableEvent,
} from '@trayful/core';
import type { Player } from './players.js';
import type { TableSession } from './session.js';

/** What an engine sends besides what any player may: asking, withdrawing and following. */
type EngineMessage = Extract<ClientMessage, { type: 'ask' | 'cancel-prompt' | 'follow' }>;

const ENGINE_MESSAGES = new Set<string>(['ask', 'cancel-prompt', 'follow']);

/** Whether a message is one only an engine may send. */
export function isEngineMessage(message: ClientMessage | null): message is EngineMessage {
  return message !== null && typeof message === 'object' && ENGINE_MESSAGES.has(message.type);
}

/**
 * One engine's connection to a table: the prompts it asks and withdraws, and the event
 * feed it follows. An engine that may not see everything hears only the answers to its
 * own prompts, since answers name pieces by their real ids.
 */
export class EngineLink {
  private unfollow: (() => void) | undefined;

  constructor(
    private readonly session: TableSession,
    private readonly player: Player | undefined,
    private readonly send: (message: ServerMessage) => void,
  ) {}

  /** Handles an engine message. Returns an error for the sender, or nothing. */
  handle(message: EngineMessage): ServerMessage | undefined {
    const { player } = this;
    if (player?.role !== 'engine') {
      return { type: 'error', message: 'Only an engine the host let in may do that.' };
    }
    try {
      if (message.type === 'ask') this.ask(player, message);
      else if (message.type === 'cancel-prompt') this.cancel(player, message.prompt);
      else this.follow(message.since);
      return undefined;
    } catch (err) {
      // Nothing has changed when these throw, so any error is safe to report and move on.
      const text =
        err instanceof PromptError ? err.message : `Invalid message: ${(err as Error).message}`;
      const requestId = message.type === 'ask' ? message.requestId : undefined;
      return { type: 'error', message: text, ...(requestId ? { requestId } : {}) };
    }
  }

  /** Stops following the table, when the engine disconnects. */
  close(): void {
    this.unfollow?.();
  }

  private ask(player: Player, message: Extract<EngineMessage, { type: 'ask' }>): void {
    const { to, prompt, until, expires, requestId } = message;
    const status = this.session.prompts.ask(prompt, playersFor(this.session, to), player.name, {
      until,
      expires,
      by: player.id,
    });
    this.send({
      type: 'asked',
      prompt: status.prompt,
      to: status.to,
      ...(requestId ? { requestId } : {}),
    });
  }

  private cancel(player: Player, id: string): void {
    if (this.session.prompts.status(id).by !== player.id) {
      throw new PromptError('An engine may only withdraw the prompts it asked.');
    }
    this.session.prompts.cancel(id);
  }

  private follow(since: number | undefined): void {
    this.unfollow?.();
    const { events } = this.session;
    const page = events.since(since);
    this.send({ type: 'events', ...page, events: page.events.filter((e) => this.hears(e)) });
    this.unfollow = events.listen((event) => {
      if (this.hears(event)) this.send({ type: 'events', events: [event], next: event.seq });
    });
  }

  private hears(event: TableEvent): boolean {
    if (event.kind !== 'answered' || this.session.seesEverything(this.player?.id)) return true;
    return this.session.prompts.asker(event.prompt) === this.player?.id;
  }
}

/**
 * The player ids a prompt is for: those named, who must have been at the table, or
 * every person there.
 */
export function playersFor(session: TableSession, to: string[] | 'everyone'): string[] {
  const roster = session.roster();
  if (to === 'everyone') {
    const people = roster.filter((p) => p.kind === 'person').map((p) => p.id);
    if (people.length === 0) throw new PromptError('Nobody has joined this table yet.');
    return people;
  }
  const unknown = to.find((id) => !roster.some((p) => p.id === id));
  if (unknown) throw new PromptError(`There is no player "${unknown}" at this table.`);
  return to;
}
