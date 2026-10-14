import { describe, expect, it } from 'vitest';
import { byCodeUnit } from './order.js';

describe('byCodeUnit', () => {
  it('puts capitals before lower case, whatever the machine’s locale', () => {
    expect(['b.yaml', 'B.yaml', 'a.yaml'].sort(byCodeUnit)).toEqual(['B.yaml', 'a.yaml', 'b.yaml']);
  });

  it('treats equal text as equal', () => {
    expect(byCodeUnit('deck', 'deck')).toBe(0);
  });
});
