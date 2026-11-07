import { expect, test } from '@playwright/test';
import { openTable } from './helpers.js';

test('the host lets a knocking engine in, sees it at the table, and sends it away', async ({
  page,
  baseURL,
}) => {
  await openTable(page);
  const knocking = fetch(`${baseURL}/api/knock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Referee' }),
  });

  const ask = page.getByRole('dialog', { name: 'An engine knocks' });
  await expect(ask).toContainText('"Referee" asks to join this table');
  await page.screenshot({ path: 'test-results/engine-knock.png' });
  await ask.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(ask).toBeHidden();
  const { player, secret } = (await (await knocking).json()) as {
    player: { id: string };
    secret: string;
  };

  // Node's own WebSocket can send the engine's credential as a header.
  const engine = new WebSocket(`${baseURL!.replace('http', 'ws')}/ws`, {
    headers: { authorization: `Bearer ${player.id}:${secret}` },
  } as unknown as string[]);
  const closed = new Promise((resolve) => engine.addEventListener('close', resolve));
  const players = page.getByRole('list', { name: 'Players' });
  await expect(players).toContainText('Referee (engine)');

  await players.getByRole('button', { name: 'Send Referee away' }).click();
  await closed;
  await expect(players).not.toContainText('Referee');
});
