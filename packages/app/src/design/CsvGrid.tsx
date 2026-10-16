// A CSV file an inventory entry reads, edited cell by cell in the Tray: its
// header row names the fields, and each row below it is a design.
import { TextInput } from './controls';
import {
  nextColumn,
  replaced,
  withColumn,
  withoutColumn,
  type Column,
  type CsvTable,
} from './tray';

/** A CSV file's header and rows, a cell each, with columns and rows to add and remove. */
export function CsvGrid({
  table,
  columns,
  onChange,
}: Readonly<{
  table: CsvTable;
  /** The component's fields, which new columns are named after. */
  columns: Column[];
  onChange: (table: CsvTable) => void;
}>) {
  const setRows = (rows: string[][]) => onChange({ ...table, rows });
  const name = (j: number) => columnName(table, j);
  return (
    <table className="tray-table">
      <CsvHeader table={table} columns={columns} onChange={onChange} />
      <tbody>
        {table.rows.map((row, i) => (
          // Rows have no id of their own; their place is what identifies them here.
          <tr key={i}>
            {table.header.map((_, j) => (
              <td key={j}>
                <TextInput
                  label={`${name(j)}, row ${i + 1}`}
                  value={row[j]}
                  onChange={(cell) =>
                    setRows(replaced(table.rows, i, replaced(row, j, cell ?? '')))
                  }
                />
              </td>
            ))}
            <td>
              <button
                type="button"
                aria-label={`Remove row ${i + 1}`}
                onClick={() => setRows(replaced(table.rows, i, undefined))}
              >
                ×
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={table.header.length + 1}>
            <button
              type="button"
              onClick={() => setRows([...table.rows, table.header.map(() => '')])}
            >
              + Row
            </button>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** The header row: a name per column, and columns to add and remove. */
function CsvHeader({
  table,
  columns,
  onChange,
}: Readonly<{ table: CsvTable; columns: Column[]; onChange: (table: CsvTable) => void }>) {
  return (
    <thead>
      <tr>
        {table.header.map((h, j) => (
          // A column's name changes as it is typed, so its place identifies it here.
          <th key={j}>
            <TextInput
              label={`Name of column ${j + 1}`}
              value={h}
              onChange={(next) =>
                onChange({ ...table, header: replaced(table.header, j, next ?? '') })
              }
            />
            <button
              type="button"
              aria-label={`Remove column ${columnName(table, j)}`}
              onClick={() => onChange(withoutColumn(table, j))}
            >
              ×
            </button>
          </th>
        ))}
        <th>
          <button
            type="button"
            onClick={() => onChange(withColumn(table, nextColumn(table, columns)))}
          >
            + Column
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
