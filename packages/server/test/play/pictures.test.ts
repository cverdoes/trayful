import type { ServerMessage } from '@trayful/core';
import { describe, expect, it } from 'vitest';
import { PictureRequests, SnapshotError } from '../../src/play/pictures.js';

/** Picture requests to `watchers` browsers, with the requests sent kept in `sent`. */
function requests(watchers: number) {
  const sent: ServerMessage[] = [];
  return {
    sent,
    pictures: new PictureRequests(
      (m) => sent.push(m),
      () => watchers,
    ),
  };
}

const idOf = (message: ServerMessage | undefined) => (message as { id: string }).id;

describe('PictureRequests', () => {
  it('fails at once when no browser is watching', async () => {
    const { pictures } = requests(0);
    await expect(
      pictures.request((id) => ({ type: 'snapshot-request', id }), 1000),
    ).rejects.toThrow(SnapshotError);
  });

  it('takes the first picture any browser sends', async () => {
    const { sent, pictures } = requests(2);
    const picture = pictures.request((id) => ({ type: 'snapshot-request', id }), 1000);
    pictures.answer(idOf(sent[0]), Buffer.from('png').toString('base64'));
    pictures.answer(idOf(sent[0]), Buffer.from('late').toString('base64'));
    expect((await picture).toString()).toBe('png');
  });

  it('waits for another browser when one cannot draw it', async () => {
    const { sent, pictures } = requests(2);
    const picture = pictures.request(
      (id) => ({ type: 'snapshot-request', id, surface: 'red' }),
      1000,
    );
    pictures.answer(idOf(sent[0]), undefined, 'This browser does not show "red".');
    pictures.answer(idOf(sent[0]), Buffer.from('red').toString('base64'));
    expect((await picture).toString()).toBe('red');
  });

  it('fails with the reason once every browser has said it cannot', async () => {
    const { sent, pictures } = requests(2);
    const picture = pictures.request((id) => ({ type: 'snapshot-request', id }), 1000);
    pictures.answer(idOf(sent[0]), undefined, 'Not here.');
    pictures.answer(idOf(sent[0]), undefined, 'Not here either.');
    await expect(picture).rejects.toThrow('Not here either.');
  });

  it('gives up on everything still awaited', async () => {
    const { pictures } = requests(3);
    const picture = pictures.request((id) => ({ type: 'snapshot-request', id }), 1000);
    pictures.cancelAll('The table closed.');
    await expect(picture).rejects.toThrow('The table closed.');
  });
});
