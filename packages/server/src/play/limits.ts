/**
 * The limits hook: a hosted Trayful may cap how far each space grows, such as by plan.
 * The server asks before anything grows; a Trayful on someone's own computer has no
 * limits at all.
 */

/** Something about to grow a space. */
export type Growth =
  /** An agent's request over MCP. */
  | { kind: 'agent' }
  | { kind: 'project' }
  | { kind: 'table'; project: string }
  /** A new invite link, or a renewed one. */
  | { kind: 'invite'; project: string; table: string }
  /** A file added to a project: an image, a CSV or another asset. */
  | { kind: 'file'; project: string; bytes: number }
  /** Connecting a repository. */
  | { kind: 'repository' };

/**
 * Whether a space may grow: undefined to allow it, or why not, in words the person
 * sees, such as "Your plan allows 3 projects."
 */
export type Limits = (growth: Growth) => string | undefined | Promise<string | undefined>;

/** Growth a space's limits do not allow; the message says why. */
export class LimitError extends Error {}

export const noLimits: Limits = () => undefined;

/** Throws a `LimitError` when the limits do not allow the growth. */
export async function checkLimits(limits: Limits, growth: Growth): Promise<void> {
  const reason = await limits(growth);
  if (reason) throw new LimitError(reason);
}
