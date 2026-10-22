import { describe, expect, it } from 'vitest';
import { MOTION_MS } from './motions';
import { gatherFrame, riffleFrame } from './shuffles';

const at = (share: number) => share * MOTION_MS.shuffle;
/** Whether a card lies square on the pile, ignoring the sign of zero. */
const square = (card: { x: number; y: number; rot: number }) =>
  Math.abs(card.x) + Math.abs(card.y) + Math.abs(card.rot) < 1e-9;

describe('riffleFrame', () => {
  it('splits the pile into two halves that lean apart', () => {
    const cards = riffleFrame(at(0.3), 6, 60)!;
    expect(cards).toHaveLength(6);
    expect(cards.filter((c) => c.x < -30 && c.rot < 0)).toHaveLength(3);
    expect(cards.filter((c) => c.x > 30 && c.rot > 0)).toHaveLength(3);
  });

  it('drops the cards back from the bottom up until the pile is square again', () => {
    const middle = riffleFrame(at(0.55), 6, 60)!;
    expect(square(middle[0]!)).toBe(true);
    expect(Math.abs(middle[5]!.x)).toBeGreaterThan(30);
    expect(riffleFrame(at(0.9), 6, 60)!.every(square)).toBe(true);
    expect(riffleFrame(at(1), 6, 60)).toBeUndefined();
  });

  it('starts from the pile as it lies', () => {
    expect(riffleFrame(-10, 2, 60)!.every(square)).toBe(true);
  });
});

describe('gatherFrame', () => {
  it('gathers a spread-out pile, holds it, and lays it out again', () => {
    expect(gatherFrame(0)).toBe(0);
    expect(gatherFrame(at(0.5))).toBe(1);
    expect(gatherFrame(at(0.99))).toBeLessThan(0.01);
    expect(gatherFrame(at(1))).toBeUndefined();
  });
});
