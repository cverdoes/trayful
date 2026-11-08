import { describe, expect, it } from 'vitest';
import { sheenOf } from '../../src/render/sheen';

describe('sheenOf', () => {
  it('shades tokens from light at the top to dark at the bottom', () => {
    const sheen = sheenOf({ outline: 'meeple', fill: 'red' }, 16, false);
    expect(sheen?.fillLinearGradientStartPoint).toEqual({ x: 0, y: 0 });
    expect(sheen?.fillLinearGradientEndPoint).toEqual({ x: 0, y: 16 });
    expect(sheen?.fillLinearGradientColorStops.at(1)).toMatch(/255,255,255/);
    expect(sheen?.fillLinearGradientColorStops.at(-1)).toMatch(/0,0,0/);
  });

  it('measures from the centre for shapes drawn around their centre', () => {
    const sheen = sheenOf({ outline: 'disc', fill: 'gold' }, 12, false);
    expect(sheen?.fillLinearGradientStartPoint).toEqual({ x: 0, y: -6 });
    expect(sheen?.fillLinearGradientEndPoint).toEqual({ x: 0, y: 6 });
  });

  it('leaves cards, boards and pieces lying flat alone', () => {
    expect(sheenOf({ outline: 'rect', fill: 'white' }, 88, false)).toBeUndefined();
    expect(sheenOf({ outline: 'disc', fill: 'gold' }, 12, true)).toBeUndefined();
  });

  it('leaves see-through pieces such as stamps alone', () => {
    expect(sheenOf({ outline: 'circle', fill: 'transparent' }, 10, false)).toBeUndefined();
  });
});
