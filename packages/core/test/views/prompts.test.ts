import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  checkPrompt,
  picks,
  PromptError,
  type PromptRequest,
} from '../../src/index.js';

const choice = (extra: Partial<PromptRequest> = {}): PromptRequest => ({
  kind: 'choice',
  text: 'Take what?',
  options: [
    { id: 'coins', label: '2 coins' },
    { id: 'card', label: '1 card' },
    { id: 'pass', label: 'Pass' },
  ],
  ...extra,
});

describe('player prompts', () => {
  it('accepts messages, confirms and choices that can be shown', () => {
    expect(() => checkPrompt({ kind: 'message', text: 'Welcome' })).not.toThrow();
    expect(() => checkPrompt({ kind: 'confirm', text: 'End your turn?' })).not.toThrow();
    expect(() => checkPrompt(choice({ min: 0, max: 2 }))).not.toThrow();
  });

  it('refuses prompts that cannot be answered as asked', () => {
    expect(() => checkPrompt({ kind: 'message', text: '  ' })).toThrow(PromptError);
    expect(() => checkPrompt({ kind: 'confirm', text: 'Sure?', options: [] })).toThrow(
      'Only a choice',
    );
    expect(() => checkPrompt(choice({ options: [{ id: 'a', label: 'A' }] }))).toThrow(
      'at least two',
    );
    expect(() =>
      checkPrompt(
        choice({
          options: [
            { id: 'a', label: 'A' },
            { id: 'a', label: 'B' },
          ],
        }),
      ),
    ).toThrow('its own id');
    expect(() => checkPrompt(choice({ min: 2, max: 1 }))).toThrow('min no more than max');
    expect(() => checkPrompt(choice({ max: 4 }))).toThrow('only 3 options');
  });

  it('picks one option unless told otherwise, and as many as min when only min is given', () => {
    expect(picks(choice())).toEqual({ min: 1, max: 1 });
    expect(picks(choice({ min: 2 }))).toEqual({ min: 2, max: 2 });
    expect(picks(choice({ min: 0 }))).toEqual({ min: 0, max: 1 });
  });

  it('takes only answers that fit the prompt', () => {
    expect(() => checkAnswer({ kind: 'message', text: 'Hi' }, true)).not.toThrow();
    expect(() => checkAnswer({ kind: 'message', text: 'Hi' }, false)).toThrow(PromptError);
    expect(() => checkAnswer({ kind: 'confirm', text: 'Sure?' }, false)).not.toThrow();
    expect(() => checkAnswer({ kind: 'confirm', text: 'Sure?' }, ['yes'])).toThrow('yes or no');
    expect(() => checkAnswer(choice(), ['card'])).not.toThrow();
    expect(() => checkAnswer(choice(), true)).toThrow('ids you picked');
    expect(() => checkAnswer(choice(), ['gold'])).toThrow('"gold" is not one of the options');
    expect(() => checkAnswer(choice({ max: 2 }), ['card', 'card'])).toThrow('each option once');
    expect(() => checkAnswer(choice(), ['card', 'coins'])).toThrow('Pick 1.');
    expect(() => checkAnswer(choice({ min: 1, max: 2 }), [])).toThrow('between 1 and 2');
  });
});
