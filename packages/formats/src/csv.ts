// CSV files as tables of text, for editing the inventory's data files cell by cell.
import { parse } from 'csv-parse/sync';

/** A CSV file: its header row, and the rows below it, each as long as the header. */
export interface CsvTable {
  header: string[];
  rows: string[][];
}

/** Reads CSV text the way the inventory loader does: blank lines skipped, cells trimmed. */
export function csvTable(text: string): CsvTable {
  const records: string[][] = parse(text, {
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
  const [header = [], ...rows] = records;
  return { header, rows: rows.map((row) => header.map((_, i) => row[i] ?? '')) };
}

/** Writes a table as CSV, quoting only the cells that need it. */
export function csvText({ header, rows }: CsvTable): string {
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(cell: string): string {
  return /[",\r\n]/.test(cell) || cell !== cell.trim() ? `"${cell.replace(/"/g, '""')}"` : cell;
}
