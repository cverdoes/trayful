/**
 * A referee for Harvest Moon: it seats two players, asks who goes first, and runs a
 * buying game at the table. Each turn the player whose turn it is buys a market card,
 * by answering the referee or just by taking the card into their hand. The referee
 * scores it on the track, refills the market from the deck, and calls the winner once
 * the market is empty.
 *
 * Run it with `node referee.ts [url]` (Node 22.18 or newer) next to a table started with
 * `trayful play examples/harvest-moon`. See README.md.
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  knock,
  TableConnection,
  type Credentials,
  type Piece,
  type PlayerInfo,
  type TableView,
} from 'trayful/engine';

const MARKET = 'main-board/market';
const DECK = 'deck:actions';
const TRACK = 'main-board/score-track';
/** The last space on the score track. */
const TRACK_END = 10;
/** Score marker colours, in seating order. */
const COLORS = ['red', 'green'] as const;

/** A player in the game, with the colour of their marker and what they scored. */
export interface Seat {
  player: PlayerInfo;
  color: (typeof COLORS)[number];
  score: number;
}

/** The face-up cards in the market, from its first spot to its last. */
export function marketCards(state: TableView): Piece[] {
  const spot = (card: Piece) => Number(card.snap!.slice(MARKET.length + 1));
  return Object.values(state.objects)
    .filter((o): o is Piece => o.kind === 'piece' && o.snap?.startsWith(`${MARKET}/`) === true)
    .sort((a, b) => spot(a) - spot(b));
}

/** The people at the table (not engines or agents) who have it open. */
function people(table: TableConnection): PlayerInfo[] {
  return table.players.filter((p) => p.kind === 'person' && p.online);
}

/** Waits until two people are at the table, telling everyone while it waits. */
async function seatPlayers(table: TableConnection): Promise<PlayerInfo[]> {
  if (people(table).length >= 2) return people(table).slice(0, 2);
  const waiting = await table.ask('everyone', {
    kind: 'message',
    title: 'Harvest Moon',
    text: 'This game needs two players. Invite someone from the More menu, and I will start when they join.',
  });
  const seated = await new Promise<PlayerInfo[]>((resolve) => {
    const stop = table.on('players', () => {
      if (people(table).length < 2) return;
      stop();
      resolve(people(table).slice(0, 2));
    });
  });
  table.cancel(waiting.id);
  return seated;
}

/** Asks both players who goes first, and seats them in that order. */
async function chooseFirst(table: TableConnection, players: PlayerInfo[]): Promise<Seat[]> {
  const asked = await table.ask(
    players.map((p) => p.id),
    {
      kind: 'choice',
      title: 'New game',
      text: 'Who goes first?',
      options: players.map((p) => ({ id: p.id, label: p.name })),
    },
    { until: 'first' },
  );
  const { answers } = await table.answers(asked.id);
  const [chosen] = Object.values(answers) as string[][];
  const order = chosen?.[0] === players[1]!.id ? [players[1]!, players[0]!] : players;
  return order.map((player, i) => ({ player, color: COLORS[i]!, score: 0 }));
}

/**
 * Resolves with the market card the player takes into their hand themselves, instead of
 * answering. The referee cannot see into hands, so it watches for a card leaving the
 * market while the player's hand grows by one.
 */
function takenByHand(table: TableConnection, seat: Seat, cards: Piece[]) {
  const held = table.state.hands[seat.player.id] ?? 0;
  let stop: () => void = () => undefined;
  const taken = new Promise<Piece>((resolve) => {
    stop = table.on('state', ({ state }) => {
      if ((state.hands[seat.player.id] ?? 0) <= held) return;
      const left = cards.find((c) => state.objects[c.id]?.snap !== c.snap);
      if (left) resolve(left);
    });
  });
  return { taken, stop };
}

/** Asks the player whose turn it is to buy a card, and waits until they have one. */
async function buy(table: TableConnection, seat: Seat): Promise<Piece> {
  for (;;) {
    const cards = marketCards(table.state);
    // Watch from before the prompt is up, so a card taken at once is not missed.
    const watch = takenByHand(table, seat, cards);
    const prompt = await table.ask([seat.player.id], {
      kind: 'pick',
      title: `${seat.player.name}'s turn`,
      text: 'Buy a card from the market: it scores its cost. Pick it here, or take it into your hand.',
      candidates: cards.map((c) => c.id),
    });
    const status = { closed: false };
    const answered = table.answers(prompt.id).then(async ({ answers }) => {
      status.closed = true;
      const [id] = (answers[seat.player.id] as string[] | undefined) ?? [];
      const card = cards.find((c) => c.id === id);
      if (card) await table.command({ type: 'move', ids: [card.id], to: `hand:${seat.player.id}` });
      return card;
    });
    // A card someone else moved first cannot be bought: ask again.
    const picked = answered.catch(() => undefined);
    const card = await Promise.race([picked, watch.taken]);
    watch.stop();
    // Taken by hand: the prompt is still up.
    if (!status.closed) table.cancel(prompt.id);
    // Withdrawn by the host, or expired: ask again.
    if (card) return card;
  }
}

/** Scores a bought card on the track, and puts the deck's top card where it was. */
async function settle(table: TableConnection, seat: Seat, card: Piece): Promise<void> {
  seat.score += Number(card.data?.cost ?? 0);
  await table.command({
    type: 'move',
    ids: [`score-marker.${seat.color}`],
    to: `${TRACK}/${Math.min(seat.score, TRACK_END)}`,
  });
  const deck = table.state.objects[DECK];
  if (deck?.kind === 'stack') {
    await table.command({ type: 'deal', from: DECK, to: card.snap!, count: 1, face: 'up' });
    return;
  }
  // A deck down to its last card is no longer a stack, just a card lying face down.
  const last = Object.values(table.state.objects).find(
    (o) => o.kind === 'piece' && o.type === card.type && o.face === 'down' && !o.snap,
  );
  if (!last) return;
  // It keeps its stand-in id while it stays face down, so move it first and then turn it up.
  await table.command({ type: 'move', ids: [last.id], to: card.snap! });
  await table.command({ type: 'flip', ids: [last.id] });
}

/** Who won, in a sentence. */
export function result(seats: Seat[]): string {
  const [a, b] = [...seats].sort((x, y) => y.score - x.score) as [Seat, Seat];
  if (a.score === b.score)
    return `A tie: ${a.player.name} and ${b.player.name} both scored ${a.score}.`;
  return `${a.player.name} wins with ${a.score} points to ${b.score}.`;
}

/** Runs one game at the table, and resolves with the seats once everyone saw the result. */
export async function referee(table: TableConnection): Promise<Seat[]> {
  const seats = await chooseFirst(table, await seatPlayers(table));
  let turn = 0;
  while (marketCards(table.state).length > 0) {
    const seat = seats[turn++ % seats.length]!;
    await settle(table, seat, await buy(table, seat));
  }
  const over = await table.ask(
    seats.map((s) => s.player.id),
    { kind: 'message', title: 'Game over', text: result(seats), anchor: TRACK },
  );
  await table.answers(over.id);
  return seats;
}

/** Knocks, or connects with the credentials saved from an earlier knock. */
async function connect(url: string, file: string): Promise<TableConnection> {
  const saved = await readFile(file, 'utf8').then(
    (text) => JSON.parse(text) as Credentials,
    () => undefined,
  );
  if (saved) {
    try {
      return await TableConnection.open(saved);
    } catch {
      // Sent away by the host since: knock again.
      await rm(file, { force: true });
    }
  }
  console.log('Knocking. Answer the prompt above your hand at the table.');
  const credentials = await knock(url, 'Referee');
  await writeFile(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  return TableConnection.open(credentials);
}

async function main(): Promise<void> {
  const table = await connect(process.argv[2] ?? 'http://127.0.0.1:4317', '.referee.json');
  table.on('event', (event) => {
    if (event.kind === 'changed') console.log(`${event.name ?? 'Someone'} ${event.text}`);
  });
  table.on('close', () => process.exit(0));
  const seats = await referee(table);
  console.log(result(seats));
  table.close();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
