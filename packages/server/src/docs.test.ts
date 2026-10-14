import { describe, expect, it } from 'vitest';
import { docTitle } from './docs.js';

describe('docTitle', () => {
  it('reads the first top-level heading', () => {
    expect(docTitle('Intro\n# Making a deck\n## Steps')).toBe('Making a deck');
  });

  it('accepts any spacing after the #, and Windows line endings', () => {
    expect(docTitle('#\tMaking a deck\r\n')).toBe('Making a deck');
    expect(docTitle('#   Making a deck')).toBe('Making a deck');
  });

  it('has no title without a top-level heading', () => {
    expect(docTitle('## Only a section\ntext')).toBeUndefined();
    expect(docTitle('#  \ntext')).toBeUndefined();
  });
});
