/**
 * Player prompts: questions and messages that something outside the table, such as an
 * agent running the game, puts in front of players. They are not table state: they are
 * never undone, and the table file does not hold them.
 */

/**
 * What a prompt asks for: `message` is dismissed, `confirm` asks yes or no, `choice`
 * picks from options, `pick` picks pieces on the table or in the hand, `place` picks a
 * drop area or spot, `number` and `text` ask the player to type an answer.
 */
export type PromptKind = 'message' | 'confirm' | 'choice' | 'pick' | 'place' | 'number' | 'text';

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
  /**
   * For `pick`: the pieces or stacks the player may pick, by id. For `place`: the drop
   * areas (`board/target`) or spots (`board/target/2`) they may pick.
   */
  candidates?: string[];
  /**
   * For `choice`, `pick` and `place`: how many to pick, both 1 unless given. For
   * `number`: the lowest and highest number the player may give.
   */
  min?: number;
  max?: number;
  /** A piece or place to show the prompt next to, as a bubble, instead of above the hand. */
  anchor?: string;
  /** Pieces or places to light up while the prompt is open, such as a tutorial's subject. */
  highlight?: string[];
}

/** A prompt as the players it is for see it. */
export interface PlayerPrompt extends PromptRequest {
  id: string;
  /** Who asks, by name, such as "Claude". */
  from: string;
  /** When the prompt closes by itself if it is still open, as an ISO date. */
  expires?: string;
}

/**
 * A player's answer: `true` to dismiss a message, yes or no to a confirm, the ids or
 * places picked in a choice, pick or place, and what they typed for a number or text.
 */
export type PromptAnswer = boolean | string[] | number | string;

/** A prompt that cannot be asked, or an answer that does not fit its prompt. */
export class PromptError extends Error {}

/** The longest text answer a player may give. */
export const MAX_TEXT_ANSWER = 500;

/** The kinds that pick from a list, and what they call the list. */
const PICKING = { choice: 'options', pick: 'candidates', place: 'candidates' } as const;

/** What the player picks from in a choice, pick or place, by id; nothing for other kinds. */
export function choicesOf(prompt: PromptRequest): string[] | undefined {
  if (prompt.kind === 'choice') return prompt.options?.map((o) => o.id) ?? [];
  if (prompt.kind === 'pick' || prompt.kind === 'place') return prompt.candidates ?? [];
  return undefined;
}

/** Throws when a prompt cannot be shown as asked, such as a choice with nothing to pick. */
export function checkPrompt(request: PromptRequest): void {
  if (!request.text.trim()) throw new PromptError('A prompt needs some text to show.');
  checkFields(request);
  const choices = choicesOf(request);
  if (choices) checkChoices(request, choices);
  else if (request.kind === 'number') checkRange(request);
}

/** Each kind takes only the fields that mean something for it. */
function checkFields(request: PromptRequest): void {
  if (request.options && request.kind !== 'choice') {
    throw new PromptError('Only a choice has options.');
  }
  if (request.candidates && request.kind !== 'pick' && request.kind !== 'place') {
    throw new PromptError('Only a pick or a place prompt has candidates.');
  }
  const bounded = choicesOf(request) !== undefined || request.kind === 'number';
  if (!bounded && (request.min !== undefined || request.max !== undefined)) {
    throw new PromptError('Only a choice, pick, place or number prompt has min and max.');
  }
}

function checkChoices(request: PromptRequest, choices: string[]): void {
  const kind = request.kind as keyof typeof PICKING;
  const fewest = kind === 'choice' ? 2 : 1;
  if (choices.length < fewest) {
    throw new PromptError(
      kind === 'choice'
        ? 'A choice needs at least two options.'
        : `A ${kind} prompt needs at least one candidate.`,
    );
  }
  if (new Set(choices).size !== choices.length) {
    throw new PromptError(`Each of the ${PICKING[kind]} must be different.`);
  }
  const { min, max } = picks(request);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < Math.max(min, 1)) {
    throw new PromptError('Pick whole numbers of things, with min no more than max.');
  }
  if (max > choices.length) {
    throw new PromptError(`There are only ${choices.length} ${PICKING[kind]} to pick from.`);
  }
}

function checkRange({ min, max }: PromptRequest): void {
  if ([min, max].some((n) => n !== undefined && !Number.isInteger(n))) {
    throw new PromptError('A number prompt asks for whole numbers, so min and max are too.');
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new PromptError('min must be no more than max.');
  }
}

/** How many things a choice, pick or place wants picked. */
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
    case 'number':
      checkNumber(prompt, answer);
      return;
    case 'text':
      checkText(answer);
      return;
    default:
      checkPicks(prompt, answer);
  }
}

function checkPicks(prompt: PromptRequest, answer: PromptAnswer): void {
  if (!Array.isArray(answer)) throw new PromptError('Answer with the ids you picked.');
  const known = new Set(choicesOf(prompt));
  const unknown = answer.find((id) => !known.has(id));
  if (unknown !== undefined) throw new PromptError(`"${unknown}" is not one you could pick.`);
  if (new Set(answer).size !== answer.length) throw new PromptError('Pick each one once.');
  const { min, max } = picks(prompt);
  if (answer.length < min || answer.length > max) {
    throw new PromptError(min === max ? `Pick ${min}.` : `Pick between ${min} and ${max}.`);
  }
}

function checkNumber({ min, max }: PromptRequest, answer: PromptAnswer): void {
  if (typeof answer !== 'number' || !Number.isInteger(answer)) {
    throw new PromptError('Answer with a whole number.');
  }
  if ((min !== undefined && answer < min) || (max !== undefined && answer > max)) {
    throw new PromptError(`Give a number ${rangeText(min, max)}.`);
  }
}

/** Words for the numbers a number prompt takes, such as "from 1 to 6". */
export function rangeText(min: number | undefined, max: number | undefined): string {
  if (min !== undefined && max !== undefined) return `from ${min} to ${max}`;
  if (min !== undefined) return `of at least ${min}`;
  return max === undefined ? '' : `of at most ${max}`;
}

function checkText(answer: PromptAnswer): void {
  if (typeof answer !== 'string' || !answer.trim()) throw new PromptError('Write an answer.');
  if (answer.length > MAX_TEXT_ANSWER) {
    throw new PromptError(`Keep the answer under ${MAX_TEXT_ANSWER} characters.`);
  }
}
