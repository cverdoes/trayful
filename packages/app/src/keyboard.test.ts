import { describe, expect, it } from 'vitest';
import { shortcutFor } from './keyboard';

const press = (key: string, mods: Partial<Record<'ctrl' | 'meta' | 'shift' | 'alt', true>> = {}) =>
  shortcutFor({
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  });

describe('shortcutFor', () => {
  it('undoes and redoes with Ctrl or Cmd', () => {
    expect(press('z', { ctrl: true })).toBe('undo');
    expect(press('z', { meta: true })).toBe('undo');
    expect(press('Z', { ctrl: true, shift: true })).toBe('redo');
    expect(press('y', { ctrl: true })).toBe('redo');
  });

  it('leaves other Ctrl and Alt keys to the browser', () => {
    expect(press('f', { ctrl: true })).toBeUndefined();
    expect(press('f', { alt: true })).toBeUndefined();
  });

  it('acts on the selection with single keys, with or without Shift', () => {
    expect(press('f')).toBe('flip');
    expect(press('F', { shift: true })).toBe('flip');
    expect(['q', 'e', 's', 'v', 'r', 'd', 'l'].map((k) => press(k))).toEqual([
      'rotateLeft',
      'rotateRight',
      'shuffle',
      'layout',
      'roll',
      'draw',
      'lock',
    ]);
    expect([press('+'), press('='), press('-')]).toEqual(['increment', 'increment', 'decrement']);
  });

  it('shrinks or opens the hand with H', () => {
    expect([press('h'), press('H', { shift: true })]).toEqual(['hand', 'hand']);
  });

  it('fits, opens help and clears with Escape', () => {
    expect([press('0'), press('?', { shift: true }), press('Escape')]).toEqual([
      'fit',
      'help',
      'escape',
    ]);
    expect(press('x')).toBeUndefined();
  });
});
