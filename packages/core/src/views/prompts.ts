/**
 * Player prompts: questions and messages that something outside the table, such as an
 * agent running the game, puts in front of players. They are not table state: they are
 * never undone and never saved with the table.
 */

/** What a prompt asks for. */
export type PromptKind = 'message' | 'confirm' | 'choice';

export interface PromptOption {
  id: string;
  label: string;
}

/** A prompt as it is asked, before Trayful gives it an id. */
export interface PromptRequest {
  kind: PromptKind;
  /** A few words above the text, such as "Your turn". */
  title?: string;
  text: string;
  /** For `choice`: what the player picks from. */
  options?: PromptOption[];
  /** For `choice`: how many options to pick. Both default to 1. */
  min?: number;
  max?: number;
}

/** A prompt as the players it is for see it. */
export interface PlayerPrompt extends PromptRequest {
  id: string;
  /** Who asks, by name, such as "Claude". */
  from: string;
}

/**
 * A player's answer: `true` to dismiss a message, yes or no to a confirm, and the ids of
 * the options picked in a choice.
 */
export type PromptAnswer = boolean | string[];

/** A prompt that cannot be asked, or an answer that does not fit its prompt. */
export class PromptError extends Error {}

/** Throws when a prompt cannot be shown as asked, such as a choice with nothing to pick. */
export function checkPrompt(request: PromptRequest): void {
  if (!request.text.trim()) throw new PromptError('A prompt needs some text to show.');
  if (request.kind !== 'choice') {
    if (request.options || request.min !== undefined || request.max !== undefined) {
      throw new PromptError('Only a choice has options, min and max.');
    }
    return;
  }
  const options = request.options ?? [];
  if (options.length < 2) throw new PromptError('A choice needs at least two options.');
  if (new Set(options.map((o) => o.id)).size !== options.length) {
    throw new PromptError('Each option of a choice needs its own id.');
  }
  const { min, max } = picks(request);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < Math.max(min, 1)) {
    throw new PromptError('A choice picks whole numbers of options, with min no more than max.');
  }
  if (max > options.length) {
    throw new PromptError(`This choice has only ${options.length} options to pick from.`);
  }
}

/** How many options a choice wants picked. */
export function picks(prompt: PromptRequest): { min: number; max: number } {
  const min = prompt.min ?? 1;
  return { min, max: prompt.max ?? Math.max(min, 1) };
}

/** Throws when an answer does not fit its prompt, so whoever asked can trust it. */
export function checkAnswer(prompt: PromptRequest, answer: PromptAnswer): void {
  switch (prompt.kind) {
    case 'message':
      if (answer !== true) throw new PromptError('A message is answered with true.');
      return;
    case 'confirm':
      if (typeof answer !== 'boolean') throw new PromptError('Answer yes or no: true or false.');
      return;
    case 'choice':
      checkPicks(prompt, answer);
  }
}

function checkPicks(prompt: PromptRequest, answer: PromptAnswer): void {
  if (!Array.isArray(answer)) throw new PromptError('Answer a choice with the ids you picked.');
  const known = new Set(prompt.options?.map((o) => o.id));
  const unknown = answer.find((id) => !known.has(id));
  if (unknown !== undefined) throw new PromptError(`"${unknown}" is not one of the options.`);
  if (new Set(answer).size !== answer.length) throw new PromptError('Pick each option once.');
  const { min, max } = picks(prompt);
  if (answer.length < min || answer.length > max) {
    throw new PromptError(min === max ? `Pick ${min}.` : `Pick between ${min} and ${max} options.`);
  }
}
