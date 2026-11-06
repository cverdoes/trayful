import { expect, test, type Page } from '@playwright/test';
import { allSpots, type Piece, type ProjectView } from '@trayful/core';
import { agent, freshTable, openTable, screen, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => {
  await freshTable(baseURL!, '2-player');
  // Tests share one table, so nothing an earlier one asked may still be waiting.
  const claude = await agent(baseURL!);
  const prompts = JSON.parse((await claude.call('list_prompts')).content[0]!.text!) as {
    id: string;
    open: boolean;
  }[];
  for (const p of prompts.filter((p) => p.open)) await claude.call('cancel_prompt', { id: p.id });
  await claude.client.close();
});

/** The id this page plays as. */
function me(page: Page) {
  return page.evaluate(
    () =>
      (window.__trayful!.store.getState() as unknown as { me: { player: { id: string } } }).me
        .player.id,
  );
}

/** What the agent hears next, from where the feed stood. */
async function answers(claude: Awaited<ReturnType<typeof agent>>, since: number) {
  const result = await claude.call('wait_for_events', { since, seconds: 5 });
  const page = JSON.parse(result.content[0]!.text!) as {
    events: { kind: string; answer?: unknown }[];
  };
  return page.events.filter((e) => e.kind === 'answered').map((e) => e.answer);
}

test('a player picks a piece on the table that a prompt asks for', async ({ page, baseURL }) => {
  await openTable(page);
  const claude = await agent(baseURL!);
  const start = JSON.parse((await claude.call('wait_for_events', { seconds: 0 })).content[0]!.text!)
    .next as number;
  await claude.call('prompt', {
    to: [await me(page)],
    kind: 'pick',
    title: 'Send a worker',
    text: 'Which worker goes to the fields?',
    candidates: ['worker.red.1', 'worker.red.2'],
  });
  await expect(page.getByRole('dialog', { name: 'Send a worker' })).toContainText(
    'Click a piece that glows gold',
  );
  await page.screenshot({ path: 'test-results/prompt-pick.png' });

  const worker = (await table(page)).objects['worker.red.2'] as Piece;
  const at = await screen(page, ...worker.pos);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('dialog', { name: 'Send a worker' })).toBeHidden();
  expect(await answers(claude, start)).toEqual([['worker.red.2']]);
  await claude.client.close();
});

test('a tutorial bubble points at a drop area, and a player picks a place', async ({
  page,
  baseURL,
}) => {
  await openTable(page);
  const claude = await agent(baseURL!);
  const start = JSON.parse((await claude.call('wait_for_events', { seconds: 0 })).content[0]!.text!)
    .next as number;
  const player = await me(page);
  await claude.call('prompt', {
    to: [player],
    kind: 'message',
    title: 'The market',
    text: 'These five cards are for sale. Each costs the coins in its corner.',
    anchor: 'main-board/market',
  });
  const bubble = page.locator('.prompt.bubble');
  await expect(bubble).toContainText('These five cards are for sale');
  await page.screenshot({ path: 'test-results/prompt-bubble.png' });
  await bubble.getByRole('button', { name: 'OK' }).click();
  await expect(bubble).toBeHidden();

  await claude.call('prompt', {
    to: [player],
    kind: 'place',
    title: 'Plant',
    text: 'Which field do you plant?',
    candidates: ['main-board/fields/1', 'main-board/fields/2'],
  });
  await expect(page.getByRole('dialog', { name: 'Plant' })).toBeVisible();

  // Click the second field, whose outline the page draws over the board.
  const view = await page.evaluate(
    async () => (await (await fetch('/api/project')).json()) as { types: ProjectView['types'] },
  );
  const field = allSpots(await table(page), view.types).find(
    (spot) => spot.ref === 'main-board/fields/2',
  )!;
  const at = await screen(page, ...field.pos);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('dialog', { name: 'Plant' })).toBeHidden();
  expect(await answers(claude, start)).toEqual([true, ['main-board/fields/2']]);
  await claude.client.close();
});
