// Designs typed into the Tray, as a grid: a column per field of the component
// and a row per design, with the row's own number of copies last. Each cell edits its field the way its kind suits: a box
// to type in, a drop-down of the field's choices, a tick box or a picker.
import type { Asset, Scalar } from '@trayful/formats/browser';
import { NumberInput } from '../panel/controls';
import { designWidths } from './grid';
import { AddRow, cellName, GridFrame, RowHead } from './GridFrame';
import { replaced, withValue, type Column, type Values } from './tray';
import { FieldInput } from './TrayCells';

/** How wide the column of copies is, in characters. */
const COPIES_WIDTH = 8;

/** Designs as rows of a grid, a column per field. */
export function DesignGrid({
  rows,
  columns,
  image,
  copies,
  onRows,
}: Readonly<{
  rows: Values[];
  columns: Column[];
  /** The image the component picks tiles of, if it does. */
  image?: Asset;
  /** How many copies a row makes when it gives no number of its own. */
  copies: number;
  onRows: (rows: Values[]) => void;
}>) {
  const set = (i: number, key: string, value: Scalar | undefined) =>
    onRows(replaced(rows, i, withValue(rows[i], key, value) ?? {}));
  const widths = designWidths(columns, rows);
  return (
    <GridFrame
      widths={[...widths, COPIES_WIDTH]}
      size={{ rows: rows.length, cols: columns.length + 1, header: false }}
    >
      <thead>
        <tr>
          <th aria-hidden="true" />
          {columns.map((c) => (
            <th key={c.name} scope="col">
              {c.name}
            </th>
          ))}
          <th scope="col">copies</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          // Rows have no id of their own; their place is what identifies them here.
          <tr key={i}>
            <RowHead
              index={i}
              only={rows.length === 1}
              onRemove={() => onRows(replaced(rows, i, undefined))}
            />
            {columns.map((column, j) => (
              <td key={column.name} {...cellName({ row: i, col: j })}>
                <FieldInput
                  column={column}
                  value={row[column.name]}
                  image={image}
                  label={`${column.name}, row ${i + 1}`}
                  onChange={(value) => set(i, column.name, value)}
                />
              </td>
            ))}
            <td {...cellName({ row: i, col: columns.length })}>
              <NumberInput
                label={`copies, row ${i + 1}`}
                value={typeof row.count === 'number' ? row.count : undefined}
                placeholder={String(copies)}
                onChange={(value) => set(i, 'count', value)}
              />
            </td>
          </tr>
        ))}
      </tbody>
      <AddRow span={columns.length + 2} onAdd={() => onRows([...rows, {}])} />
    </GridFrame>
  );
}
