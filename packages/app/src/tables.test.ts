import { describe, expect, it } from 'vitest';
import { tableChoices } from './tables';

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
