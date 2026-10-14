import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Stack } from '@trayful/core';
import { agent, DECK, freshTable, openTable, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!, false));

test('an agent deals and plays a round while a person watches', async ({ page, baseURL }) => {
  await openTable(page);
  const claude = await agent(baseURL!);

  const overview = await claude.call('describe_table');
  expect(overview.content[0]!.text).toContain('deck:actions: 10 ×');

  // Shuffle and deal two hands of three, face up, below the components.
  await claude.call('shuffle', { id: DECK });
  await claude.call('deal', {
    from: DECK,
    to: [
      [100, 500],
      [300, 500],
    ],
    count: 3,
    face: 'up',
  });
  await expect(page.locator('.activity')).toContainText('dealt 6 cards');

  // The person's browser shows the same table: two piles of three and a smaller deck.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(
            (window.__trayful!.store.getState() as unknown as { table: { objects: object } }).table
              .objects,
          ).filter((id) => id.startsWith('stack:')).length,
      ),
    )
    .toBe(2);
  expect(((await table(page)).objects[DECK] as Stack).items).toHaveLength(4);

  // Play a card from the first hand to the middle of the table.
  const [hand] = JSON.parse(
    (await claude.call('query_objects', { region: [50, 450, 100, 100] })).content[0]!.text!,
  ) as { id: string }[];
  await claude.call('draw', { from: hand!.id, to: [200, 650] });

  // The agent can look at the table the way people see it.
  const snap = await claude.call('snapshot');
  const png = Buffer.from(snap.content[0]!.data!, 'base64');
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(10_000);
  await writeFile('test-results/agent-snapshot.png', png);

  // Each player undoes only their own moves: the person has none, the agent can undo its last.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await claude.call('undo');
  await expect
    .poll(async () => ((await table(page)).objects[hand!.id] as Stack).items.length)
    .toBe(3);

  await page.screenshot({ path: 'test-results/agent-round.png' });
  await claude.client.close();
});
