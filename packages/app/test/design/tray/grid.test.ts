import { describe, expect, it } from 'vitest';
import {
  cellAfterKey,
  columnWidths,
  copiedCells,
  designWidths,
  pastedInto,
  type CellKey,
} from '../../../src/design/tray/grid';
import type { Values } from '../../../src/design/tray/tray';

const cards = {
  header: ['title', 'text', 'value'],
  rows: [
    ['Explore', 'Draw two cards and keep one.', '1'],
    ['Build', 'Pay 2 to place a token.', '2'],
  ],
};

const key = (name: string, caret: Partial<CellKey> = {}): CellKey => ({
  key: name,
  shift: false,
  atStart: false,
  atEnd: false,
  ...caret,
});

/** The size of the grid of `cards`: two rows of three cells, under column names to type in. */
const size = { rows: 2, cols: 3, header: true };

describe('keys in a grid', () => {
  it('go a row down or up with the arrows and Enter', () => {
    const at = { row: 0, col: 1 };
    expect(cellAfterKey(key('ArrowDown'), at, size)).toEqual({ row: 1, col: 1 });
    expect(cellAfterKey(key('Enter'), at, size)).toEqual({ row: 1, col: 1 });
    expect(cellAfterKey(key('ArrowUp'), { row: 1, col: 1 }, size)).toEqual(at);
    expect(cellAfterKey(key('Enter', { shift: true }), { row: 1, col: 1 }, size)).toEqual(at);
  });

  it('reach the header row above the first row, when it has boxes', () => {
    const at = { row: 0, col: 2 };
    expect(cellAfterKey(key('ArrowUp'), at, size)).toEqual({ row: -1, col: 2 });
    expect(cellAfterKey(key('ArrowUp'), at, { ...size, header: false })).toBeUndefined();
  });

  it('go a column over only once the caret is at the edge of the text', () => {
    const at = { row: 0, col: 1 };
    expect(cellAfterKey(key('ArrowLeft'), at, size)).toBeUndefined();
    expect(cellAfterKey(key('ArrowRight'), at, size)).toBeUndefined();
    expect(cellAfterKey(key('ArrowLeft', { atStart: true }), at, size)).toEqual({
      row: 0,
      col: 0,
    });
    expect(cellAfterKey(key('ArrowRight', { atEnd: true }), at, size)).toEqual({
      row: 0,
      col: 2,
    });
  });

  it('stay in the cell at the edges of the grid, and for other keys', () => {
    expect(cellAfterKey(key('ArrowUp'), { row: -1, col: 0 }, size)).toBeUndefined();
    expect(cellAfterKey(key('Enter'), { row: 1, col: 0 }, size)).toBeUndefined();
    expect(
      cellAfterKey(key('ArrowLeft', { atStart: true }), { row: 0, col: 0 }, size),
    ).toBeUndefined();
    expect(
      cellAfterKey(key('ArrowRight', { atEnd: true }), { row: 0, col: 2 }, size),
    ).toBeUndefined();
    expect(
      cellAfterKey(key('a', { atStart: true, atEnd: true }), { row: 0, col: 1 }, size),
    ).toBeUndefined();
  });
});

describe('cells copied from a spreadsheet', () => {
  it('are split at tabs and line breaks', () => {
    expect(copiedCells('Rest\t1\nFeast\t2')).toEqual([
      ['Rest', '1'],
      ['Feast', '2'],
    ]);
    expect(copiedCells('Rest\t1\r\nFeast\t2\r\n')).toEqual([
      ['Rest', '1'],
      ['Feast', '2'],
    ]);
  });

  it('keep empty cells', () => {
    expect(copiedCells('\tb\n\n')).toEqual([['', 'b'], ['']]);
    expect(copiedCells('')).toEqual([['']]);
  });

  it('keep the tabs, line breaks and quotes of a quoted cell', () => {
    expect(copiedCells('"Skip a\tturn,\nthen ""rest""."\t0')).toEqual([
      ['Skip a\tturn,\nthen "rest".', '0'],
    ]);
  });

  it('keep a quote that does not quote the whole cell', () => {
    expect(copiedCells('"Rest" now\t1')).toEqual([['"Rest" now', '1']]);
  });
});

describe('pasting into a CSV grid', () => {
  it('leaves a single cell to the box it is pasted in', () => {
    expect(pastedInto(cards, { row: 0, col: 0 }, 'Rest')).toBeUndefined();
  });

  it('fills the cells rightwards and down from the cell pasted in', () => {
    expect(pastedInto(cards, { row: 0, col: 1 }, 'Rest a turn.\t0\nFeast.\t5\n')).toEqual({
      header: cards.header,
      rows: [
        ['Explore', 'Rest a turn.', '0'],
        ['Build', 'Feast.', '5'],
      ],
    });
  });

  it('adds rows for cells past the last row, and leaves out cells past the last column', () => {
    expect(pastedInto(cards, { row: 1, col: 1 }, 'a\tb\tc\nd\te')).toEqual({
      header: cards.header,
      rows: [cards.rows[0], ['Build', 'a', 'b'], ['', 'd', 'e']],
    });
  });

  it('names columns when pasted in the header row', () => {
    expect(pastedInto(cards, { row: -1, col: 0 }, 'name\trules')?.header).toEqual([
      'name',
      'rules',
      'value',
    ]);
  });

  it('changes nothing of the table it was given', () => {
    pastedInto(cards, { row: 0, col: 0 }, 'a\tb');
    expect(cards.rows[0]![0]).toBe('Explore');
  });
});

describe('the columns of a grid', () => {
  it('are as wide as their longest cell, within limits', () => {
    expect(columnWidths(cards)).toEqual([12, 30, 12]);
    expect(columnWidths({ header: ['a'], rows: [['x'.repeat(100)]] })).toEqual([40]);
    expect(columnWidths({ header: [''], rows: [[]] })).toEqual([7]);
  });

  it('fit the name, values and choices of a field, for designs in rows', () => {
    const columns = [
      { name: 'name', field: { type: 'string' as const, optional: false } },
      { name: 'suit', field: { type: 'enum' as const, enum: ['red', 'emerald'], optional: false } },
      { name: 'cost', field: { type: 'int' as const, optional: false } },
    ];
    const rows: Values[] = [{ name: 'Harvest festival', suit: 'red', cost: 1 }, { cost: 12 }];
    expect(designWidths(columns, rows)).toEqual([18, 12, 6]);
    expect(designWidths(columns, [{}])).toEqual([14, 12, 6]);
  });
});
