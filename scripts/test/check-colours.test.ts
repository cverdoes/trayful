/**
 * The colour check: what counts as a colour of a rule's own, and what does not.
 */
import { describe, expect, it } from 'vitest';
import { coloursIn } from '../check-colours.js';

describe('coloursIn', () => {
  it('finds hex colours, colour functions and the keywords, with their lines', () => {
    const css = [
      '.a { color: #fff; }',
      '.b { background: rgb(0 0 0 / 50%); border-color: hsla(0, 0%, 0%, 0.5); }',
      '.c { color: white; outline: 1px solid black; }',
    ].join('\n');
    expect(coloursIn(css)).toEqual([
      { line: 1, text: '#fff' },
      { line: 2, text: 'rgb(' },
      { line: 2, text: 'hsla(' },
      { line: 3, text: 'white' },
      { line: 3, text: 'black' },
    ]);
  });

  it('lets tokens, mixes of tokens and words that only contain a keyword through', () => {
    const css = [
      '.a { color: var(--tf-text); white-space: nowrap; }',
      '.b { background: color-mix(in srgb, var(--tf-focus) 25%, transparent); }',
      '.c { grid-area: blackboard; content: "#top"; }',
    ].join('\n');
    expect(coloursIn(css)).toEqual([]);
  });

  it('skips comments but keeps counting their lines', () => {
    const css = '/* Was #2f81f7,\n   white on black. */\n.a { color: #000; }';
    expect(coloursIn(css)).toEqual([{ line: 3, text: '#000' }]);
  });
});
