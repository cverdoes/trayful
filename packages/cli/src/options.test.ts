import { describe, expect, it } from 'vitest';
import { parsePlayArgs } from './options.js';

describe('parsePlayArgs', () => {
  it('plays the current folder in a browser by default', () => {
    expect(parsePlayArgs([])).toEqual({ dir: '.', open: true, share: false, tunnel: false });
  });

  it('reads every option', () => {
    expect(
      parsePlayArgs([
        'games',
        '--project',
        'harvest-moon',
        '--table',
        'try-2',
        '--port',
        '0',
        '--seed',
        '7',
        '--setup',
        'two-players',
        '--no-open',
        '--share',
        '--tunnel',
      ]),
    ).toEqual({
      dir: 'games',
      project: 'harvest-moon',
      table: 'try-2',
      port: 0,
      seed: 7,
      setup: 'two-players',
      open: false,
      share: true,
      tunnel: true,
    });
  });

  it('turns --setup none into no setup', () => {
    expect(parsePlayArgs(['--setup', 'none']).setup).toBe(false);
  });

  it('explains what is wrong with the arguments', () => {
    expect(() => parsePlayArgs(['--seed', '-1'])).toThrow('--seed needs a whole number.');
    expect(() => parsePlayArgs(['--port', '1.5'])).toThrow('--port needs a whole number.');
    expect(() => parsePlayArgs(['--setup'])).toThrow('--setup needs a setup name, or "none".');
    expect(() => parsePlayArgs(['--frob'])).toThrow('Unknown option "--frob".');
    expect(() => parsePlayArgs(['a', 'b'])).toThrow('Give one project folder.');
  });
});
