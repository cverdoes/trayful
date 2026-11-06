import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  checkPrompt,
  picks,
  PromptError,
  rangeText,
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
    ).toThrow('options must be different');
    expect(() => checkPrompt(choice({ min: 2, max: 1 }))).toThrow('min no more than max');
    expect(() => checkPrompt(choice({ max: 4 }))).toThrow('only 3 options to pick from');
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
    expect(() => checkAnswer(choice(), ['gold'])).toThrow('"gold" is not one you could pick');
    expect(() => checkAnswer(choice({ max: 2 }), ['card', 'card'])).toThrow('each one once');
    expect(() => checkAnswer(choice(), ['card', 'coins'])).toThrow('Pick 1.');
    expect(() => checkAnswer(choice({ min: 1, max: 2 }), [])).toThrow('between 1 and 2');
  });

  it('picks pieces and places from candidates', () => {
    const pick: PromptRequest = {
      kind: 'pick',
      text: 'Discard two',
      candidates: ['a', 'b', 'c'],
      min: 2,
    };
    expect(() => checkPrompt(pick)).not.toThrow();
    expect(() => checkAnswer(pick, ['a', 'c'])).not.toThrow();
    expect(() => checkAnswer(pick, ['a'])).toThrow('Pick 2.');
    expect(() => checkPrompt({ kind: 'pick', text: 'Pick', candidates: [] })).toThrow(
      'at least one candidate',
    );
    const place: PromptRequest = { kind: 'place', text: 'Where?', candidates: ['board/market/1'] };
    expect(() => checkAnswer(place, ['board/market/1'])).not.toThrow();
    expect(() => checkPrompt({ kind: 'confirm', text: 'Sure?', candidates: ['a'] })).toThrow(
      'Only a pick or a place prompt has candidates',
    );
  });

  it('asks for whole numbers within a range, and for some text', () => {
    const number: PromptRequest = { kind: 'number', text: 'How many?', min: 1, max: 6 };
    expect(() => checkPrompt(number)).not.toThrow();
    expect(() => checkAnswer(number, 3)).not.toThrow();
    expect(() => checkAnswer(number, 7)).toThrow('Give a number from 1 to 6.');
    expect(() => checkAnswer(number, 2.5)).toThrow('whole number');
    expect(() => checkAnswer(number, '3')).toThrow('whole number');
    expect(() => checkPrompt({ kind: 'number', text: 'n', min: 3, max: 1 })).toThrow(
      'min must be no more than max',
    );
    expect(() => checkPrompt({ kind: 'text', text: 'Name it', min: 1 })).toThrow(
      'Only a choice, pick, place or number prompt has min and max',
    );
    expect(() => checkAnswer({ kind: 'text', text: 'Name it' }, 'Oakvale')).not.toThrow();
    expect(() => checkAnswer({ kind: 'text', text: 'Name it' }, '  ')).toThrow('Write an answer');
    expect(() => checkAnswer({ kind: 'text', text: 'Name it' }, 'x'.repeat(501))).toThrow(
      'under 500',
    );
  });

  it('says which numbers a number prompt takes', () => {
    expect(rangeText(1, 6)).toBe('from 1 to 6');
    expect(rangeText(0, undefined)).toBe('of at least 0');
    expect(rangeText(undefined, 9)).toBe('of at most 9');
    expect(rangeText(undefined, undefined)).toBe('');
  });
});
