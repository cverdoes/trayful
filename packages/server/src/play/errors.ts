import { CommandError, PromptError, SetupError, type ServerMessage } from '@trayful/core';

/**
 * The error to send back for a client message that failed: what was wrong with a
 * command, setup or answer as it is, anything else as an invalid message.
 */
export function errorReply(err: unknown, requestId?: string): ServerMessage {
  const message =
    err instanceof CommandError || err instanceof SetupError || err instanceof PromptError
      ? err.message
      : `Invalid message: ${(err as Error).message}`;
  return { type: 'error', message, requestId };
}
