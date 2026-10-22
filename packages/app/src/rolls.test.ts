import { describe, expect, it } from 'vitest';
import { MOTION_MS } from './motions';
import { rollFrame } from './rolls';

const ROLL_MS = MOTION_MS.roll;

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
