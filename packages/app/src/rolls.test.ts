import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLL_MS, rollFrame, rollsSettleIn, startRolls } from './rolls';

describe('rollFrame', () => {
  it('tumbles through faces, lands on the result, then lies still as it was', () => {
    const faces = Array.from({ length: 20 }, (_, i) => rollFrame((i * ROLL_MS) / 40, 6)?.face);
    expect(faces[0]).toBeDefined();
    expect(new Set(faces.filter((f) => f !== undefined)).size).toBeGreaterThan(2);
    // It shows its result well before it stops turning.
    expect(rollFrame(ROLL_MS * 0.8, 6)).toMatchObject({ scale: expect.any(Number) });
    expect(rollFrame(ROLL_MS * 0.8, 6)?.face).toBeUndefined();
    expect(rollFrame(ROLL_MS, 6)).toBeUndefined();
  });

  it('turns fast at first and slows down', () => {
    const turn = (at: number) => rollFrame(at * ROLL_MS, 6)!.turn;
    expect(turn(0.1) - turn(0)).toBeGreaterThan(turn(0.9) - turn(0.8));
    expect(rollFrame(-5, 6)).toMatchObject({ turn: 0, scale: 1 });
  });
});

describe('startRolls', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts the rolled dice and forgets those that settled', () => {
    expect(startRolls({ old: 0, recent: 900 }, ['d6'], 2000)).toEqual({ recent: 900, d6: 2000 });
  });

  it('keeps dice still for people who ask for less motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(startRolls({}, ['d6'], 1000)).toEqual({});
  });
});

describe('rollsSettleIn', () => {
  it('waits for the last die to settle', () => {
    expect(rollsSettleIn({}, 500)).toBe(0);
    expect(rollsSettleIn({ a: 0, b: 400 }, 500)).toBe(ROLL_MS - 100);
  });
});
