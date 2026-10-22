import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION_MS, settleIn, startMotion } from './motions';

const roll = (at: number) => ({ kind: 'roll' as const, at });

describe('startMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sets pieces moving and forgets those that came to rest', () => {
    const moving = { old: roll(0), recent: roll(900) };
    expect(startMotion(moving, { kind: 'shuffle', ids: ['deck'] }, 2000)).toEqual({
      recent: roll(900),
      deck: { kind: 'shuffle', at: 2000 },
    });
  });

  it('keeps everything still for people who ask for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(startMotion({}, { kind: 'roll', ids: ['d6'] }, 1000)).toEqual({});
  });
});

describe('settleIn', () => {
  it('waits for the last motion to end', () => {
    expect(settleIn({}, 500)).toBe(0);
    expect(settleIn({ a: roll(0), b: roll(400) }, 500)).toBe(MOTION_MS.roll - 100);
    expect(settleIn({ deck: { kind: 'shuffle', at: 400 } }, 500)).toBe(MOTION_MS.shuffle - 100);
  });
});
