// The spreadsheet side of the Tray's grids: which cell a key moves to, what
// pasting cells copied from a spreadsheet changes, and how wide each column is.
import type { Column, CsvTable, Values } from './tray';

/** A cell of a grid. Row -1 is the header row, which names the columns. */
export interface Cell {
  row: number;
  col: number;
}

/** How many cells a grid has to move between. */
export interface GridSize {
  rows: number;
  cols: number;
  /** Whether the header row has boxes too, as a CSV file's column names do. */
  header: boolean;
}

/** A key pressed in a cell, with where the caret was in the cell's text. */
export interface CellKey {
  key: string;
  shift: boolean;
  /** Whether the caret is at the start of the text, or the whole text is selected. */
  atStart: boolean;
  /** Whether the caret is at the end of the text, or the whole text is selected. */
  atEnd: boolean;
}

/**
 * The cell a key moves to, as in a spreadsheet: up and down, Enter and Shift+Enter
 * go a row down or up, and left and right go a column over once the caret is at the
 * edge of the text. Undefined when the key stays in the cell.
 */
export function cellAfterKey(pressed: CellKey, at: Cell, size: GridSize): Cell | undefined {
  const [down, right] = step(pressed) ?? [0, 0];
  const next = { row: at.row + down, col: at.col + right };
  const inside =
    next.row >= (size.header ? -1 : 0) &&
    next.row < size.rows &&
    next.col >= 0 &&
    next.col < size.cols;
  return (down !== 0 || right !== 0) && inside ? next : undefined;
}

/** How far a key moves, in rows down and columns right. */
function step({ key, shift, atStart, atEnd }: CellKey): [number, number] | undefined {
  switch (key) {
    case 'Enter':
      return shift ? [-1, 0] : [1, 0];
    case 'ArrowUp':
      return [-1, 0];
    case 'ArrowDown':
      return [1, 0];
    case 'ArrowLeft':
      return atStart ? [0, -1] : undefined;
    case 'ArrowRight':
      return atEnd ? [0, 1] : undefined;
    default:
      return undefined;
  }
}

/** One cell, quoted when it holds a tab, a line break or a quote, or bare up to the next tab or line. */
const COPIED_CELL = /"((?:[^"]|"")*)"(?=\t|\r?\n|$)|([^\t\r\n]*)/y;

/**
 * Cells copied from a spreadsheet, as it puts them on the clipboard: a line per
 * row and a tab between cells, quoted with doubled quotes when a cell holds either.
 */
export function copiedCells(text: string): string[][] {
  const rows: string[][] = [[]];
  let at = 0;
  for (;;) {
    COPIED_CELL.lastIndex = at;
    // The bare form matches the empty string, so a cell is always found.
    const [, quoted, bare] = COPIED_CELL.exec(text)!;
    rows.at(-1)!.push(quoted === undefined ? bare! : quoted.replaceAll('""', '"'));
    at = COPIED_CELL.lastIndex;
    if (at >= text.length) break;
    if (text[at] === '\t') {
      at += 1;
    } else {
      at += text.startsWith('\r\n', at) ? 2 : 1;
      rows.push([]);
    }
  }
  // A copied range ends with a line break, which starts no row of its own.
  const last = rows.at(-1)!;
  if (rows.length > 1 && last.length === 1 && last[0] === '') rows.pop();
  return rows;
}

/**
 * The table with pasted cells written in from `at`, rightwards and down. Rows are
 * added for cells that run past the last row; cells past the last column are left
 * out, since a column's name must be a field. Undefined when the text is a single
 * cell, which the box takes as typed.
 */
export function pastedInto(table: CsvTable, at: Cell, text: string): CsvTable | undefined {
  const cells = copiedCells(text);
  if (cells.length === 1 && cells[0]!.length === 1) return undefined;
  const lines = [table.header, ...table.rows].map((line) => [...line]);
  cells.forEach((pasted, i) => {
    const line = (lines[at.row + 1 + i] ??= table.header.map(() => ''));
    pasted.forEach((value, j) => {
      if (at.col + j < table.header.length) line[at.col + j] = value;
    });
  });
  const [header = [], ...rows] = lines;
  return { header, rows };
}

/** The narrowest and widest a column is drawn, in characters. */
const WIDTH = { min: 6, max: 40 };

/** Room beside a CSV column's name for its remove button, in characters. */
const HEADER_ROOM = 3;

/** Room beside a drop-down's choice for its arrow, in characters. */
const ARROW_ROOM = 3;

/** How wide a column with these texts is drawn, in characters: enough for the longest, within limits. */
function widthFor(lengths: number[]): number {
  return Math.min(WIDTH.max, Math.max(WIDTH.min, Math.max(...lengths) + 2));
}

/** How wide each column of a CSV file is drawn, in characters. */
export function columnWidths(table: CsvTable): number[] {
  return table.header.map((name, j) =>
    widthFor([name.length + HEADER_ROOM, ...table.rows.map((row) => (row[j] ?? '').length)]),
  );
}

/**
 * The least room a field of a kind gets while its cells are empty, in characters:
 * text needs room to start typing, and a colour has its picker and swatches.
 */
const EMPTY_ROOM: Partial<Record<Column['field']['type'], number>> = {
  string: 12,
  image: 12,
  color: 28,
};

/** How wide each field's column is drawn for designs in rows, in characters. */
export function designWidths(columns: Column[], rows: Values[]): number[] {
  return columns.map(({ name, field }) =>
    widthFor([
      name.length,
      EMPTY_ROOM[field.type] ?? 0,
      ...(field.enum ?? []).map((option) => String(option).length + ARROW_ROOM),
      ...rows.map((row) => String(row[name] ?? '').length),
    ]),
  );
}
