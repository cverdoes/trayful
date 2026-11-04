import { describe, expect, it } from 'vitest';
import { csvTable, csvText } from './csv.js';

describe('CSV tables', () => {
  it('reads a header and rows, padding short rows to the header', () => {
    expect(csvTable('﻿name, count\nForest,4\n\nLake\n')).toEqual({
      header: ['name', 'count'],
      rows: [
        ['Forest', '4'],
        ['Lake', ''],
      ],
    });
  });

  it('writes what it reads back, quoting only cells that need it', () => {
    const table = { header: ['name', 'text'], rows: [['Raid', 'Steal 1, "maybe" 2']] };
    const text = csvText(table);
    expect(text).toBe('name,text\nRaid,"Steal 1, ""maybe"" 2"\n');
    expect(csvTable(text)).toEqual(table);
  });
});
