import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerPrompt } from '@trayful/core';
import { startServer, type RunningServer } from '@trayful/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { knock, TableConnection } from 'trayful/engine';
import { marketCards, referee, result, type Seat } from '../referee.js';

const example = fileURLToPath(new URL('../../harvest-moon', import.meta.url));

let server: RunningServer;
let host: string;
let table: TableConnection;
/** Errors the table reported that answer no request of the referee's. */
let errors: string[];

beforeEach(async () => {
  errors = [];
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-referee-'));
  await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  server = await startServer({ projectDir: dir, port: 0, seed: 7, appDir: path.join(dir, 'x') });
  host = (await server.workspace.players.host()).id;
  server.session.subscribe(() => undefined, host);
  const knocking = knock(server.url, 'Referee');
  server.session.prompts.answer(host, (await promptFor(host)).id, ['allow']);
  table = await TableConnection.open(await knocking);
  table.on('error', (message) => errors.push(message));
});

afterEach(async () => {
  table.close();
  await server.close();
});

/** The player's oldest prompt, once one is up. */
async function promptFor(player: string): Promise<PlayerPrompt> {
  for (;;) {
    const [prompt] = server.session.prompts.waitingFor(player);
    if (prompt) return prompt;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Brings a second player to the table. */
async function joinGuest(name: string): Promise<string> {
  const { player } = await server.workspace.players.join(name, 'guest');
  server.session.subscribe(() => undefined, player.id);
  return player.id;
}

/** What the host sees on the table. */
const seen = () => server.session.viewFor(host);

describe('the Harvest Moon referee', () => {
  it('waits for a second player, then runs a game to the end', async () => {
    const game = referee(table);
    const waiting = await promptFor(host);
    expect(waiting).toMatchObject({ kind: 'message', from: 'Referee' });

    const bo = await joinGuest('Bo');
    const first = await promptFor(bo);
    expect(first).toMatchObject({ kind: 'choice', text: 'Who goes first?' });
    expect(server.session.prompts.waitingFor(host).map((p) => p.id)).toEqual([first.id]);
    server.session.prompts.answer(bo, first.id, [bo]);

    // Bo goes first: the referee asks the players in turn until the market is empty.
    for (let turn = 0; turn < 10; turn++) {
      const player = turn % 2 === 0 ? bo : host;
      const pick = await promptFor(player);
      expect(pick).toMatchObject({ kind: 'pick', title: expect.stringContaining('turn') });
      expect(pick.candidates).toEqual(marketCards(seen()).map((c) => c.id));
      if (turn === 3) {
        // Taking a card by hand counts as buying it, and the prompt is withdrawn.
        server.session.act(host, { type: 'move', ids: [pick.candidates![0]!], to: `hand:${host}` });
      } else {
        server.session.prompts.answer(player, pick.id, [pick.candidates!.at(-1)!]);
      }
      while (server.session.prompts.waitingFor(player).some((p) => p.id === pick.id)) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    const over = await promptFor(host);
    expect(over).toMatchObject({ kind: 'message', title: 'Game over' });
    server.session.prompts.answer(host, over.id, true);
    server.session.prompts.answer(bo, over.id, true);
    const seats = await game;

    expect(seats.map((s) => [s.player.id, s.color])).toEqual([
      [bo, 'red'],
      [host, 'green'],
    ]);
    // Every card in the game was bought: 16 points in all.
    expect(seats[0]!.score + seats[1]!.score).toBe(16);
    expect(marketCards(seen())).toEqual([]);
    expect(seen().hands).toEqual({ [bo]: 5, [host]: 5 });
    const marker = (color: string) => seen().objects[`score-marker.${color}`];
    expect(marker('red')).toMatchObject({ snap: `main-board/score-track/${seats[0]!.score}` });
    expect(marker('green')).toMatchObject({ snap: `main-board/score-track/${seats[1]!.score}` });
    expect(over.text).toBe(result(seats));
    expect(errors).toEqual([]);
  });

  it('calls a tie, or the player who scored more', () => {
    const seat = (name: string, score: number) =>
      ({ player: { name }, color: 'red', score }) as Seat;
    expect(result([seat('Ann', 7), seat('Bo', 9)])).toBe('Bo wins with 9 points to 7.');
    expect(result([seat('Ann', 8), seat('Bo', 8)])).toBe('A tie: Ann and Bo both scored 8.');
  });
});
