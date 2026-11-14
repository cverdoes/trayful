import { describe, expect, it } from 'vitest';
import { itemAfterKey } from '../../src/ui/menuKeys';

describe('itemAfterKey', () => {
  const all = [true, true, true];

  it('moves down and up one item', () => {
    expect(itemAfterKey('ArrowDown', 0, all)).toBe(1);
    expect(itemAfterKey('ArrowUp', 2, all)).toBe(1);
  });

  it('goes round at the ends', () => {
    expect(itemAfterKey('ArrowDown', 2, all)).toBe(0);
    expect(itemAfterKey('ArrowUp', 0, all)).toBe(2);
  });

  it('goes to the first and last item on Home and End', () => {
    expect(itemAfterKey('Home', 2, all)).toBe(0);
    expect(itemAfterKey('End', 0, all)).toBe(2);
  });

  it('skips items that cannot be picked', () => {
    expect(itemAfterKey('ArrowDown', 0, [true, false, true])).toBe(2);
    expect(itemAfterKey('ArrowUp', 2, [true, false, true])).toBe(0);
    expect(itemAfterKey('Home', 2, [false, true, true])).toBe(1);
    expect(itemAfterKey('End', 0, [true, true, false])).toBe(1);
  });

  it('starts at an end when no item has the focus', () => {
    expect(itemAfterKey('ArrowDown', -1, all)).toBe(0);
    expect(itemAfterKey('ArrowUp', -1, all)).toBe(2);
  });

  it('moves nowhere on other keys, or when nothing can be picked', () => {
    expect(itemAfterKey('a', 0, all)).toBeUndefined();
    expect(itemAfterKey('ArrowDown', 0, [false, false])).toBeUndefined();
  });
});
