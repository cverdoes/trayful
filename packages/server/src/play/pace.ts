import { GLIDE_MS, MOTION_MS, type Motion } from '@trayful/core';

/**
 * Keeps an agent from rushing people watching: after each agent change it knows how long
 * that change takes to play out on their tables (pieces sliding into place, dice landing),
 * and the agent hears back only once it has.
 */
export class AgentPace {
  /** When the agent's latest change will have played out, by `Date.now()`. */
  private busyUntil = 0;

  constructor(private readonly enabled: boolean) {}

  /** Notes an agent change, with the motion it shows, while `watchers` people look on. */
  changed(motion: Motion | undefined, watchers: number): void {
    if (!this.enabled || watchers === 0) return;
    this.busyUntil = Date.now() + (motion ? MOTION_MS[motion.kind] : GLIDE_MS);
  }

  /** Resolves once the agent's latest change has played out for people watching. */
  async playedOut(): Promise<void> {
    const wait = this.busyUntil - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
