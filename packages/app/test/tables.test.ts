import { describe, expect, it } from 'vitest';
import { suggestName, tableChoices } from './tables';

describe('tableChoices', () => {
  const view = { project: 'harvest', table: 'table-2' };

  it('lists a project’s tables', () => {
    expect(tableChoices({ id: 'harvest', tables: ['table-1', 'table-2'] }, view)).toEqual([
      'table-1',
      'table-2',
    ]);
  });

  it('adds the open table when the project does not list it yet', () => {
    expect(tableChoices({ id: 'harvest', tables: ['table-1'] }, view)).toEqual([
      'table-1',
      'table-2',
    ]);
  });

  it('offers a first table for a project with none', () => {
    expect(tableChoices({ id: 'other', tables: [] }, view)).toEqual(['table-1']);
  });
});

describe('suggestName', () => {
  it('numbers a new table after the ones there are, skipping names in use', () => {
    expect(suggestName([])).toBe('table-1');
    expect(suggestName(['table-1'])).toBe('table-2');
    expect(suggestName(['table-2', 'table-3'])).toBe('table-4');
  });
});
