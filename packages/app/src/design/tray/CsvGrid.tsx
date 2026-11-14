// A CSV file an inventory entry reads, edited in the Tray as a spreadsheet: its
// header row names the fields, and each row below it is a design. The keys and
// pasting work as in a spreadsheet; see grid.ts.
import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cellAfterKey, columnWidths, pastedInto, type Cell } from './grid';
import {
  nextColumn,
  replaced,
  withColumn,
  withoutColumn,
  type Column,
  type CsvTable,
} from './tray';

/** Reports a changed table; `alone` makes the change a step of its own to undo, as a paste is. */
type TableChange = (table: CsvTable, alone?: boolean) => void;

/** A CSV file's header and rows as a grid of cells, with columns and rows to add and remove. */
export function CsvGrid({
  table,
  columns,
  onChange,
}: Readonly<{
  table: CsvTable;
  /** The component's fields, which new columns are named after. */
  columns: Column[];
  onChange: TableChange;
}>) {
  const grid = useRef<HTMLDivElement>(null);
  const cell = cellEvents(table, onChange, (at) =>
    grid.current?.querySelector<HTMLInputElement>(`[data-cell="${at.row}:${at.col}"]`),
  );
  const setRows = (rows: string[][]) => onChange({ ...table, rows });
  const name = (j: number) => columnName(table, j);
  return (
    <div className="csv-grid" ref={grid}>
      <table>
        <colgroup>
          <col className="csv-gutter" />
          {columnWidths(table).map((width, j) => (
            <col key={j} style={{ width: `${width}ch` }} />
          ))}
          <col className="csv-gutter" />
        </colgroup>
        <CsvHeader table={table} columns={columns} onChange={onChange} cell={cell} />
        <tbody>
          {table.rows.map((row, i) => (
            // Rows have no id of their own; their place is what identifies them here.
            <tr key={i}>
              <th scope="row" className="csv-row-head">
                <span>{i + 1}</span>
                <button
                  type="button"
                  className="csv-remove"
                  aria-label={`Remove row ${i + 1}`}
                  title="Remove row"
                  onClick={() => setRows(replaced(table.rows, i, undefined))}
                >
                  ×
                </button>
              </th>
              {table.header.map((_, j) => (
                <td key={j}>
                  <input
                    type="text"
                    {...cell({ row: i, col: j })}
                    aria-label={`${name(j)}, row ${i + 1}`}
                    value={row[j] ?? ''}
                    onChange={(e) =>
                      setRows(replaced(table.rows, i, replaced(row, j, e.target.value)))
                    }
                  />
                </td>
              ))}
              <td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={table.header.length + 2}>
              <button
                type="button"
                className="csv-add-row"
                onClick={() => setRows([...table.rows, table.header.map(() => '')])}
              >
                + Row
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** What a cell's box does with keys and pastes, and the name its box is found by. */
type CellProps = (at: Cell) => {
  'data-cell': string;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>) => void;
};

/**
 * Keys that move between cells, and pastes of several cells that fill the cells
 * from the one pasted in. `box` finds a cell's box, to move to.
 */
function cellEvents(
  table: CsvTable,
  onChange: TableChange,
  box: (at: Cell) => HTMLInputElement | null | undefined,
): CellProps {
  return (at) => ({
    'data-cell': `${at.row}:${at.col}`,
    onKeyDown: (e) => {
      if (e.nativeEvent.isComposing) return;
      const next = cellAfterKey(keyIn(e), at, table);
      if (!next) return;
      e.preventDefault();
      // Arriving in a cell selects its text, so typing replaces it, as in a spreadsheet.
      box(next)?.select();
    },
    onPaste: (e) => {
      const next = pastedInto(table, at, e.clipboardData.getData('text/plain'));
      if (!next) return;
      e.preventDefault();
      onChange(next, true);
    },
  });
}

/** A key pressed in a cell's box, with where its caret is. */
function keyIn(e: KeyboardEvent<HTMLInputElement>) {
  const { selectionStart, selectionEnd, value } = e.currentTarget;
  const whole = selectionStart === 0 && selectionEnd === value.length;
  return {
    key: e.key,
    shift: e.shiftKey,
    atStart: whole || selectionEnd === 0,
    atEnd: whole || selectionStart === value.length,
  };
}

/** The header row: a name per column, and columns to add and remove. */
function CsvHeader({
  table,
  columns,
  onChange,
  cell,
}: Readonly<{
  table: CsvTable;
  columns: Column[];
  onChange: TableChange;
  cell: CellProps;
}>) {
  return (
    <thead>
      <tr>
        <th className="csv-corner" aria-hidden="true" />
        {table.header.map((h, j) => (
          // A column's name changes as it is typed, so its place identifies it here.
          <th key={j}>
            <div className="csv-head">
              <input
                type="text"
                {...cell({ row: -1, col: j })}
                aria-label={`Name of column ${j + 1}`}
                value={h}
                onChange={(e) =>
                  onChange({ ...table, header: replaced(table.header, j, e.target.value) })
                }
              />
              <button
                type="button"
                className="csv-remove"
                aria-label={`Remove column ${columnName(table, j)}`}
                title="Remove column"
                onClick={() => onChange(withoutColumn(table, j))}
              >
                ×
              </button>
            </div>
          </th>
        ))}
        <th>
          <button
            type="button"
            className="csv-add-column"
            aria-label="Add column"
            title="Add column"
            onClick={() => onChange(withColumn(table, nextColumn(table, columns)))}
          >
            +
          </button>
        </th>
      </tr>
    </thead>
  );
}

/** A column's name as its header has it, or its place when the header cell is empty. */
function columnName(table: CsvTable, index: number): string {
  const name = table.header[index] ?? '';
  return name === '' ? `column ${index + 1}` : name;
}
