import { describe, expect, it } from 'vitest';
import { frameText } from './frames.js';

describe('frameText', () => {
  it('reads a message delivered as one buffer', () => {
    expect(frameText(Buffer.from('{"type":"undo"}'))).toBe('{"type":"undo"}');
  });

  it('joins a message delivered in fragments', () => {
    expect(frameText([Buffer.from('{"type":'), Buffer.from('"undo"}')])).toBe('{"type":"undo"}');
  });

  it('reads a message delivered as an ArrayBuffer', () => {
    const bytes = new TextEncoder().encode('{"type":"undo"}');
    expect(frameText(bytes.buffer)).toBe('{"type":"undo"}');
  });
});
