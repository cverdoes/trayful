// A CSV file an inventory entry reads, edited in the Tray as a spreadsheet: its
// header row names the fields, and each row below it is a design. The keys and
// pasting work as in a spreadsheet; see GridFrame.tsx and grid.ts.
import { Icon } from '../../ui/Icon';
import { columnWidths, pastedInto, type Cell } from './grid';
import { AddRow, cellName, GridFrame, RowHead } from './GridFrame';
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
  /** The component's fields: new columns are named after them, and a field with choices gets a drop-down. */
  columns: Column[];
  onChange: TableChange;
}>) {
  const setRows = (rows: string[][]) => onChange({ ...table, rows });
  // Several cells pasted at once fill the cells from the one pasted in.
  const paste = (at: Cell, text: string) => {
    const next = pastedInto(table, at, text);
    if (next) onChange(next, true);
    return next !== undefined;
  };
  return (
    <GridFrame
      widths={columnWidths(table)}
      size={{ rows: table.rows.length, cols: table.header.length, header: true }}
      trailing
      onPaste={paste}
    >
      <CsvHeader table={table} columns={columns} onChange={onChange} />
      <tbody>
        {table.rows.map((row, i) => (
          // Rows have no id of their own; their place is what identifies them here.
          <tr key={i}>
            <RowHead index={i} onRemove={() => setRows(replaced(table.rows, i, undefined))} />
            {table.header.map((name, j) => (
              <td key={j} {...cellName({ row: i, col: j })}>
                <CsvCell
                  choices={columns.find((c) => c.name === name)?.field.enum}
                  label={`${columnName(table, j)}, row ${i + 1}`}
                  value={row[j] ?? ''}
                  onChange={(cell) => setRows(replaced(table.rows, i, replaced(row, j, cell)))}
                />
              </td>
            ))}
            <td />
          </tr>
        ))}
      </tbody>
      <AddRow
        span={table.header.length + 2}
        onAdd={() => setRows([...table.rows, table.header.map(() => '')])}
      />
    </GridFrame>
  );
}

/** A cell's text: typed, or picked from a drop-down when its column's field has choices. */
function CsvCell({
  choices,
  label,
  value,
  onChange,
}: Readonly<{
  choices?: (string | number)[];
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  if (!choices) {
    return (
      <input
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const options = choices.map(String);
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {/* What the file has stays on offer, even when the field has no such choice. */}
      {!options.includes(value) && <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** The header row: a name per column, and columns to add and remove. */
function CsvHeader({
  table,
  columns,
  onChange,
}: Readonly<{ table: CsvTable; columns: Column[]; onChange: TableChange }>) {
  return (
    <thead>
      <tr>
        <th aria-hidden="true" />
        {table.header.map((h, j) => (
          // A column's name changes as it is typed, so its place identifies it here.
          <th key={j} {...cellName({ row: -1, col: j })}>
            <div className="grid-head">
              <input
                type="text"
                aria-label={`Name of column ${j + 1}`}
                value={h}
                onChange={(e) =>
                  onChange({ ...table, header: replaced(table.header, j, e.target.value) })
                }
              />
              <button
                type="button"
                className="grid-remove"
                aria-label={`Remove column ${columnName(table, j)}`}
                title="Remove column"
                onClick={() => onChange(withoutColumn(table, j))}
              >
                <Icon name="x" />
              </button>
            </div>
          </th>
        ))}
        <th>
          <button
            type="button"
            className="grid-add-column"
            aria-label="Add column"
            title="Add column"
            onClick={() => onChange(withColumn(table, nextColumn(table, columns)))}
          >
            <Icon name="plus" />
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
