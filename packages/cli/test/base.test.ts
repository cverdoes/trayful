import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { terminalConfirm } from '../src/base.js';

/** A stream that says it is a terminal, as a person's would; it reads and writes. */
function terminal(): NodeJS.ReadStream & NodeJS.WriteStream {
  return Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream &
    NodeJS.WriteStream;
}

describe('terminalConfirm', () => {
  it('asks nobody without a terminal', () => {
    const notTerminal = new PassThrough() as unknown as NodeJS.ReadStream;
    expect(terminalConfirm(notTerminal, terminal())).toBeUndefined();
  });

  it('takes y or yes for yes, and anything else for no', async () => {
    for (const [answer, yes] of [
      ['y', true],
      ['Yes', true],
      ['', false],
      ['nope', false],
    ] as const) {
      const input = terminal();
      const asked = terminalConfirm(input, terminal())!('Go on?');
      input.write(`${answer}\n`);
      expect(await asked).toBe(yes);
    }
  });
});
