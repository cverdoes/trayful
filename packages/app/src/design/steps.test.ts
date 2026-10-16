import { expect, it } from 'vitest';
import { noSteps, redone, stepped, undone } from './steps';

it('goes back and forward through the changes', () => {
  let steps = stepped(stepped(noSteps<number>(), 1, false), 2, false);
  const back = undone(steps, 3)!;
  expect(back.value).toBe(2);
  const forward = redone(back.steps, back.value)!;
  expect(forward).toEqual({ value: 3, steps: { past: [1, 2], future: [] } });
  steps = undone(back.steps, 2)!.steps;
  expect(undone(steps, 1)).toBeUndefined();
  expect(redone(noSteps<number>(), 1)).toBeUndefined();
});

it('joins a merged change to the one before, and drops what could be redone', () => {
  const typed = stepped(stepped(noSteps<string>(), 'a', false), 'ab', true);
  expect(typed.past).toEqual(['a']);
  // The first change has nothing to join, so it is a step of its own.
  expect(stepped(noSteps<string>(), 'a', true).past).toEqual(['a']);
  const back = undone(typed, 'abc')!;
  expect(stepped(back.steps, 'a', false).future).toEqual([]);
});
