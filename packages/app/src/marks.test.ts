import { markBoxes, type Piece } from '@trayful/core';
import type { ComponentType } from '@trayful/formats/browser';
import { describe, expect, it } from 'vitest';
import { clickBox, eraseBox, textCommand, textSize } from './marks';

const types: Record<string, ComponentType> = {
  sheet: {
    id: 'sheet',
    size: [100, 40],
    is: 'piece',
    container: [
      { id: 'tick', points: [[10, 10]], mode: 'stamp', accepts: ['cross'] },
      { id: 'pick', points: [[30, 10]], mode: 'stamp' },
      { id: 'score', grid: { origin: [70, 20], cols: 1, rows: 1, cell: [30, 10] }, mode: 'text' },
    ],
  },
  cross: { id: 'cross', size: 8, is: 'stamp' },
  ring: { id: 'ring', size: [12, 10], is: 'stamp' },
};

const sheet = (marks?: Piece['marks']): Piece => ({
  kind: 'piece',
  id: 'sheet',
  type: 'sheet',
  pos: [0, 0],
  rot: 0,
  face: 'up',
  z: 0,
  ...(marks ? { marks } : {}),
});
const box = (piece: Piece, key: string) => markBoxes(piece, types).find((b) => b.key === key)!;
const screen = { x: 5, y: 6 };

describe('stamp and text boxes', () => {
  it('sizes a box by its cell, or by its largest stamp', () => {
    expect(markBoxes(sheet(), types).map((b) => [b.key, b.size])).toEqual([
      ['tick/0', [8, 8]],
      ['pick/0', [12, 10]],
      ['score/0', [30, 10]],
    ]);
  });

  it('stamps a box that takes one stamp at once, unless it already has it', () => {
    expect(clickBox(box(sheet(), 'tick/0'), screen)).toEqual({
      command: { type: 'mark', at: 'sheet/tick/0', stamp: 'cross' },
    });
    expect(
      clickBox(box(sheet({ 'tick/0': { stamp: 'cross' } }), 'tick/0'), screen),
    ).toBeUndefined();
  });

  it('asks which stamp, or what text, for any other box', () => {
    expect(clickBox(box(sheet(), 'pick/0'), screen)).toEqual({
      pick: { at: 'sheet/pick/0', stamps: ['cross', 'ring'], screen },
    });
    expect(clickBox(box(sheet({ 'score/0': { text: '7' } }), 'score/0'), screen)).toEqual({
      pick: { at: 'sheet/score/0', stamps: [], screen, text: '7' },
    });
  });

  it('erases only a box with something on it', () => {
    expect(eraseBox(box(sheet(), 'tick/0'))).toBeUndefined();
    expect(eraseBox(box(sheet({ 'tick/0': { stamp: 'cross' } }), 'tick/0'))).toEqual({
      type: 'erase',
      at: 'sheet/tick/0',
    });
  });

  it('writes new text, erases emptied text and leaves unchanged text alone', () => {
    const pick = { at: 'sheet/score/0', stamps: [], screen, text: '7' };
    expect(textCommand(pick, ' 8 ')).toEqual({ type: 'mark', at: 'sheet/score/0', text: '8' });
    expect(textCommand(pick, '  ')).toEqual({ type: 'erase', at: 'sheet/score/0' });
    expect(textCommand(pick, '7')).toBeUndefined();
    expect(textCommand({ ...pick, text: undefined }, '')).toBeUndefined();
  });

  it('writes short text as tall as the box allows, and long text smaller', () => {
    expect(textSize('7', [30, 10])).toBe(7);
    expect(textSize('a long name', [30, 10])).toBeLessThan(5);
  });
});
