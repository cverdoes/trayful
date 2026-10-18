import { expect, test, type Page } from '@playwright/test';
import type { Stack } from '@trayful/core';
import { DECK, freshTable, inviteGuest, screen, table } from './helpers.js';

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
  const { context: guest, guest: bob } = await inviteGuest(page, browser, 'Bob');

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

  // The host takes back their own move; Bob's card stays in his hand.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.hand-card')).toHaveCount(1);
  await expect(bob.locator('.hand-card')).toHaveCount(1);
  await guest.close();
});

test('the hand tray resizes from its top edge and keeps its height', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  const tray = page.locator('.hand-tray');
  const before = (await tray.boundingBox())!;
  const edge = (await page.getByRole('separator', { name: 'Resize your hand' }).boundingBox())!;
  const x = edge.x + edge.width / 2;
  const y = edge.y + edge.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await tray.boundingBox())!.height).toBe(before.height + 100);

  await page.reload();
  await expect.poll(async () => (await tray.boundingBox())!.height).toBe(before.height + 100);
});

test('H shrinks the hand to a bubble that still takes cards', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__trayful?.store.getState().status === 'online');
  await page.keyboard.press('h');
  const bubble = page.getByRole('button', { name: /Open your hand/ });
  await expect(bubble).toContainText('0');

  const deck = (await table(page)).objects[DECK] as Stack;
  await dragToHand(page, deck.pos);
  await expect(bubble).toContainText('1');
  await expect(page.locator('.hand-card')).toHaveCount(0);

  await page.reload();
  await expect(bubble).toContainText('1');
  await bubble.click();
  await expect(page.locator('.hand-card')).toHaveCount(1);
  await page.keyboard.press('h');
  await expect(bubble).toBeVisible();
});
