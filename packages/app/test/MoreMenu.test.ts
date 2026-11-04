import { describe, expect, it } from 'vitest';
import { nextChoice } from './MoreMenu';

describe('nextChoice', () => {
  it('moves down and up the list, wrapping around at the ends', () => {
    expect(nextChoice(0, 1, 4)).toBe(1);
    expect(nextChoice(3, 1, 4)).toBe(0);
    expect(nextChoice(0, -1, 4)).toBe(3);
  });

  it('goes to the first choice with Down and the last with Up from the More button', () => {
    expect(nextChoice(-1, 1, 4)).toBe(0);
    expect(nextChoice(-1, -1, 4)).toBe(3);
  });
});
