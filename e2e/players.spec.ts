import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Stack } from '@trayful/core';
import { DECK, freshTable, screen, table } from './helpers.js';

test.beforeEach(async ({ baseURL }) => freshTable(baseURL!));

/** What the page knows about the table: hand counts and the pieces it was sent. */
function seen(page: Page) {
  return page.evaluate(() => {
    const { table, me } = window.__trayful!.store.getState() as unknown as {
      table: { hands: Record<string, number>; objects: Record<string, { hand?: string }> };
      me: { player: { id: string } };
    };
    return {
      me: me.player.id,
      hands: table.hands,
      inHands: Object.values(table.objects)
        .filter((o) => o.hand)
        .map((o) => o.hand),
    };
  });
}

/** Drags from a table point (in mm) to the middle of the hand tray. */
async function dragToHand(page: Page, from: [number, number]) {
  const a = await screen(page, ...from);
  const tray = (await page.locator('.hand-tray').boundingBox())!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, (a.y + tray.y) / 2, { steps: 5 });
  await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('two players keep their hands hidden from each other', async ({ page, browser }) => {
  // The host plays in one browser; a guest joins through the invite link in another.
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  const { root } = (await (await page.request.get('/api/health')).json()) as { root: string };
  const { invite } = JSON.parse(
    await readFile(path.join(root, '.trayful', 'players.json'), 'utf8'),
  ) as { invite: string };

  const guest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const bob = await guest.newPage();
  await bob.goto(`/join/${invite}`);
  await bob.getByLabel('Your name').fill('Bob');
  await bob.getByRole('button', { name: 'Join' }).click();
  await bob.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await expect(bob).not.toHaveURL(/join/);
  await expect(page.getByRole('list', { name: 'Players' })).toContainText('Bob');

  // Each takes the top card of the deck into their hand.
  const deck = (await table(page)).objects[DECK] as Stack;
  await dragToHand(page, deck.pos);
  await expect(page.locator('.hand-card')).toHaveCount(1);
  await dragToHand(bob, deck.pos);
  await expect(bob.locator('.hand-card')).toHaveCount(1);

  const host = await seen(page);
  expect(host.hands).toEqual({ [host.me]: 1, bob: 1 });
  expect(host.inHands).toEqual([host.me]);
  const guestView = await seen(bob);
  expect(guestView.inHands).toEqual(['bob']);
  await expect(bob.getByRole('list', { name: 'Players' })).toContainText('1');
  await bob.screenshot({ path: 'test-results/guest-hand.png' });

  // The host plays their card onto the table; now both see it face up.
  const card = (await page.locator('.hand-card').getAttribute('data-id'))!;
  const spot = await screen(page, deck.pos[0] + 90, deck.pos[1] + 100);
  await page.locator('.hand-card').dragTo(page.locator('.table'), { targetPosition: spot });
  await expect(page.locator('.hand-card')).toHaveCount(0);
  await expect
    .poll(() =>
      bob.evaluate(
        (id) =>
          (
            window.__trayful!.store.getState() as unknown as {
              table: { objects: Record<string, { face: string }> };
            }
          ).table.objects[id]?.face,
        card,
      ),
    )
    .toBe('up');
  await expect(bob.locator('.activity')).toContainText('moved 1 piece');
  await guest.close();
});
