import { describe, expect, it } from 'vitest';
import { Journal } from '../../src/git/journal.js';

describe('Journal', () => {
  it('says who changed what in one line', () => {
    const journal = new Journal();
    journal.note('agent', 'upsert_type');
    journal.note('agent', 'add_asset');
    journal.note('agent', 'upsert_type');
    journal.note('Claes', 'Tray');
    expect(journal.message()).toBe('Trayful: upsert_type, add_asset (agent); Tray (Claes)');
  });

  it('lists the changes below a short first line when there are many', () => {
    const journal = new Journal();
    for (const tool of ['upsert_type', 'rename_type', 'set_inventory', 'add_asset', 'set_color']) {
      journal.note('agent', tool);
    }
    journal.note('Claes', 'designer');
    expect(journal.message()).toBe(
      [
        'Trayful: changes by agent, Claes',
        '',
        '- upsert_type (agent)',
        '- rename_type (agent)',
        '- set_inventory (agent)',
        '- add_asset (agent)',
        '- set_color (agent)',
        '- designer (Claes)',
      ].join('\n'),
    );
  });

  it('falls back to a plain message, and starts over once cleared', () => {
    const journal = new Journal();
    expect(journal.message()).toBe('Trayful: save changes');
    journal.note('agent', 'add_asset');
    journal.clear();
    expect(journal.message()).toBe('Trayful: save changes');
  });
});
