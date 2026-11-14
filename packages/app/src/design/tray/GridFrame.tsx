// The frame the Tray's grids share: a ruled table that looks and moves like a
// spreadsheet, whatever is in its cells. A cell is a `td` or `th` marked with
// `cellName`, holding a box to type in, a drop-down or a picker.
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { Icon } from '../../ui/Icon';
import { cellAfterKey, type Cell, type CellKey, type GridSize } from './grid';

/** The attribute that marks a cell of the grid, for the keys to find it by. */
export const cellName = (at: Cell) => ({ 'data-cell': `${at.row}:${at.col}` });

/** What a cell can hold that takes the focus. */
const FOCUSABLE = 'input, select, summary';

/**
 * A grid of cells: the arrow keys and Enter move between its text boxes and
 * tick boxes, as in a spreadsheet. A drop-down keeps its keys, which pick from it.
 */
export function GridFrame({
  widths,
  size,
  trailing = false,
  onPaste,
  children,
}: Readonly<{
  /** How wide each column is, in characters. */
  widths: number[];
  size: GridSize;
  /** Whether a narrow column follows the last, for a button to add a column. */
  trailing?: boolean;
  /** Takes text pasted into a cell; true when the grid used it, so the cell's box should not. */
  onPaste?: (at: Cell, text: string) => boolean;
  /** The table's head, body and foot. */
  children: ReactNode;
}>) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || box.type === 'color') return;
    const at = cellOf(box);
    if (!at || e.nativeEvent.isComposing) return;
    const next = cellAfterKey(keyIn(e, box), at, size);
    if (!next) return;
    e.preventDefault();
    focusCell(e.currentTarget, next);
  };
  const paste = (e: ClipboardEvent<HTMLDivElement>) => {
    const at = e.target instanceof Element ? cellOf(e.target) : undefined;
    if (at && onPaste?.(at, e.clipboardData.getData('text/plain'))) e.preventDefault();
  };
  return (
    // The keys are handled here for every cell at once; the cells' own boxes take the focus.
    <div className="tray-grid" onKeyDown={onKeyDown} onPaste={paste}>
      <table>
        <colgroup>
          <col className="grid-gutter" />
          {widths.map((width, j) => (
            <col key={j} style={{ width: `${width}ch` }} />
          ))}
          {trailing && <col className="grid-gutter" />}
        </colgroup>
        {children}
      </table>
    </div>
  );
}

/** The cell an element is in, if it is in one. */
function cellOf(element: Element): Cell | undefined {
  const name = element.closest<HTMLElement>('[data-cell]')?.dataset.cell;
  if (name === undefined) return undefined;
  const [row = 0, col = 0] = name.split(':').map(Number);
  return { row, col };
}

/** A key pressed in a cell's box, with where its caret is. A tick box has no text to move in. */
function keyIn(e: KeyboardEvent, box: HTMLInputElement): CellKey {
  const { selectionStart, selectionEnd, value } = box;
  const whole = box.type !== 'text' || (selectionStart === 0 && selectionEnd === value.length);
  return {
    key: e.key,
    shift: e.shiftKey,
    atStart: whole || selectionEnd === 0,
    atEnd: whole || selectionStart === value.length,
  };
}

/** Moves the focus to a cell. Its text is selected, so typing replaces it, as in a spreadsheet. */
function focusCell(grid: HTMLElement, at: Cell): void {
  const cell = grid.querySelector(`[data-cell="${at.row}:${at.col}"]`);
  const box = cell?.querySelector<HTMLElement>(FOCUSABLE);
  box?.focus();
  if (box instanceof HTMLInputElement && box.type === 'text') box.select();
}

/** The start of a row: its number, which its remove button takes the place of on hover. */
export function RowHead({
  index,
  onRemove,
  only = false,
}: Readonly<{
  index: number;
  onRemove: () => void;
  /** Whether this is the only row, which stays. */
  only?: boolean;
}>) {
  return (
    <th scope="row" className="grid-row-head">
      <span>{index + 1}</span>
      <button
        type="button"
        className="grid-remove"
        aria-label={`Remove row ${index + 1}`}
        title="Remove row"
        disabled={only}
        onClick={onRemove}
      >
        <Icon name="x" />
      </button>
    </th>
  );
}

/** The foot of a grid: a button across it that adds a row. */
export function AddRow({ span, onAdd }: Readonly<{ span: number; onAdd: () => void }>) {
  return (
    <tfoot>
      <tr>
        <td colSpan={span}>
          <button type="button" className="grid-add-row" aria-label="Add row" onClick={onAdd}>
            <Icon name="plus" /> Row
          </button>
        </td>
      </tr>
    </tfoot>
  );
}
