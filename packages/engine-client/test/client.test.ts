import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerPrompt } from '@trayful/core';
import { startServer, type RunningServer } from '@trayful/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { knock, KnockRefused, TableConnection, type Credentials } from '../src/index.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));
const DECK = 'deck:actions';

let server: RunningServer;
let host: string;

beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-engine-client-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  server = await startServer({ projectDir: dir, port: 0, seed: 7, appDir: path.join(dir, 'x') });
  host = (await server.workspace.players.host()).id;
  // The host has the table open, so prompts can be put to them.
  server.session.subscribe(() => undefined, host);
});

afterEach(async () => {
  await server.close();
});

/** The host's oldest prompt, once one is up. */
async function hostPrompt(): Promise<PlayerPrompt> {
  for (;;) {
    const [prompt] = server.session.prompts.waitingFor(host);
    if (prompt) return prompt;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Knocks as "Referee", and has the host answer with `choice`. */
async function knockAnswered(choice: string): Promise<Credentials> {
  const knocking = knock(server.url, 'Referee');
  const prompt = await hostPrompt();
  server.session.prompts.answer(host, prompt.id, [choice]);
  return knocking;
}

describe('the engine client', () => {
  it('is let in, moves pieces, asks the host and hears the answer', async () => {
    const credentials = await knockAnswered('allow');
    expect(credentials).toMatchObject({ player: 'referee', table: 'table-1', fullView: false });

    const table = await TableConnection.open(credentials);
    expect(table.state.objects[DECK]).toMatchObject({ kind: 'stack' });
    const events: string[] = [];
    table.on('event', (e) => events.push(e.kind));

    await table.command({ type: 'shuffle', id: DECK });
    await expect(table.command({ type: 'shuffle', id: 'nope' })).rejects.toThrow('nope');

    const asked = await table.ask([host], { kind: 'confirm', text: 'Ready?' });
    expect(asked).toMatchObject({ from: 'Referee', to: [host] });
    server.session.prompts.answer(host, asked.id, true);
    expect(await table.answers(asked.id)).toEqual({
      reason: 'answered',
      answers: { [host]: true },
    });
    // Asked again after it closed, the result is still there.
    expect((await table.answers(asked.id)).reason).toBe('answered');
    expect(events).toEqual(expect.arrayContaining(['changed', 'answered', 'prompt-closed']));
    expect(table.next).toBeGreaterThan(0);
    await expect(table.ask(['nobody'], { kind: 'message', text: 'Hi' })).rejects.toThrow(
      'There is no player "nobody" at this table.',
    );

    const closing = new Promise((resolve) => table.on('close', resolve));
    table.close();
    await closing;
  });

  it('hears when its prompt is withdrawn, and errors that answer no request', async () => {
    const table = await TableConnection.open(await knockAnswered('allow-full-view'));
    const asked = await table.ask('everyone', { kind: 'message', text: 'Hello' });
    table.cancel(asked.id);
    expect(await table.answers(asked.id)).toEqual({ reason: 'cancelled', answers: {} });

    const error = new Promise((resolve) => table.on('error', resolve));
    table.cancel('nope');
    expect(await error).toBe('There is no prompt "nope".');
    table.close();
  });

  it('says why the host did not let it in', async () => {
    const refused = await knockAnswered('deny').catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(KnockRefused);
    expect(refused).toMatchObject({ reason: 'denied' });
    await expect(knock(server.url, 'Referee')).rejects.toMatchObject({ reason: 'busy' });
    await expect(knock(`${server.url}/`, ' ')).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('cannot connect once the host sent it away', async () => {
    const credentials = await knockAnswered('allow');
    const table = await TableConnection.open(credentials);
    const closed = new Promise((resolve) => table.on('close', resolve));
    await server.app.inject({ method: 'DELETE', url: `/api/engines/${credentials.player}` });
    await closed;
    await expect(TableConnection.open(credentials)).rejects.toThrow('Could not connect');
  });

  it('says so when the table it was let into is gone', async () => {
    const credentials = await knockAnswered('allow');
    await expect(TableConnection.open({ ...credentials, project: 'gone' })).rejects.toThrow(
      'The table closed the connection',
    );
  });
});
