import { describe, expect, it } from 'vitest';
import { parsePlayArgs } from '../src/options.js';

describe('parsePlayArgs', () => {
  it('plays the current folder in a browser by default', () => {
    expect(parsePlayArgs([])).toEqual({
      dir: '.',
      open: true,
      share: false,
      tunnel: false,
      container: false,
      owner: false,
      yes: false,
      pace: true,
    });
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
        '--no-pace',
        '--yes',
        '--owner',
        '--public-url',
        'https://trayful.example.com',
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
      container: false,
      owner: true,
      yes: true,
      publicUrl: 'https://trayful.example.com',
      pace: false,
    });
  });

  it('runs in a container without opening a browser, asking, or sharing on the network', () => {
    expect(parsePlayArgs(['--container'])).toMatchObject({
      container: true,
      open: false,
      yes: true,
    });
    expect(() => parsePlayArgs(['--container', '--share'])).toThrow(
      '--share does not work in a container',
    );
  });

  it('runs in owner mode without opening a browser, and checks the public address', () => {
    expect(parsePlayArgs(['--owner'])).toMatchObject({ owner: true, open: false });
    expect(() => parsePlayArgs(['--public-url', 'trayful.example.com'])).toThrow(
      '--public-url needs a web address',
    );
  });

  it('turns --setup none into no setup', () => {
    expect(parsePlayArgs(['--setup', 'none']).setup).toBe(false);
  });

  it('explains what is wrong with the arguments', () => {
    expect(() => parsePlayArgs(['--seed', '-1'])).toThrow('--seed needs a whole number.');
    expect(() => parsePlayArgs(['--port', '1.5'])).toThrow('--port needs a whole number.');
    expect(() => parsePlayArgs(['--setup'])).toThrow('--setup needs a setup name, or "none".');
    expect(() => parsePlayArgs(['--frob'])).toThrow('Unknown option "--frob".');
    expect(() => parsePlayArgs(['a', 'b'])).toThrow('Give one folder');
  });

  it('reads a git-backed start', () => {
    expect(parsePlayArgs(['--data', 'srv'])).toMatchObject({ data: 'srv' });
    expect(parsePlayArgs(['--data', 'srv']).repo).toBeUndefined();
    expect(
      parsePlayArgs([
        '--data',
        'srv',
        '--repo',
        'https://github.com/me/game',
        '--branch',
        'prototype',
        '--path',
        'proto',
      ]),
    ).toMatchObject({
      data: 'srv',
      repo: { url: 'https://github.com/me/game', branch: 'prototype', path: 'proto' },
    });
  });

  it('refuses git-backed options that do not go together', () => {
    expect(() => parsePlayArgs(['--repo', 'https://github.com/me/game'])).toThrow(/need --data/);
    expect(() => parsePlayArgs(['games', '--data', 'srv'])).toThrow(/give no project folder/);
    expect(() => parsePlayArgs(['--data', 'srv', '--branch', 'x'])).toThrow(/go with --repo/);
    expect(() => parsePlayArgs(['--data'])).toThrow(/--data needs a folder/);
    expect(() => parsePlayArgs(['--data', 'srv', '--repo'])).toThrow(/--repo needs a value/);
  });
});
