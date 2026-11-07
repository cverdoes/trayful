# Harvest Moon referee (example engine)

A small program that runs a game at a Trayful table, written with the engine client `trayful/engine`. It plays a simple buying game on the [Harvest Moon](../harvest-moon) sample, which has no rules of its own:

1. It waits until two people are at the table, and tells everyone while it waits.
2. It asks both players who goes first. The first player scores with the red marker, the second with the green.
3. On each turn it asks the player whose turn it is to buy a card from the market. The player picks one at the prompt, or just takes a market card into their hand: the referee notices either way.
4. It moves that player's score marker on by the card's cost, and refills the empty market spot from the deck.
5. When the market is empty it calls the winner, or a tie.

The referee only advises, as every engine does: players can still move anything. It sees what a player with no hand of their own sees, so it asks for no full view.

## Run it

You need Node.js 22.18 or newer, which runs TypeScript files as they are. Copy this folder somewhere, then:

```sh
npm install
npx trayful play path/to/harvest-moon
```

Open the table in your browser, and in another terminal, in this folder:

```sh
npm start
```

The referee knocks: click **Allow** on the prompt above your hand. It keeps what it connects with in `.referee.json`, so it does not knock again next time, until you send it away with the × by its name. Invite a second player from the **More** menu, and the game starts.

Pass another address to reach a table elsewhere, such as `node referee.ts http://127.0.0.1:5000`.

## What it shows

| In `referee.ts` | How                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `connect`       | Knocking once, keeping the credentials, and knocking again after being sent away                |
| `seatPlayers`   | Reading `table.players`, listening for `players`, and withdrawing a prompt with `table.cancel`  |
| `chooseFirst`   | A `choice` prompt to two players that closes on the first answer                                |
| `buy`           | A `pick` prompt racing a `state` listener, for a player who moves the card themselves           |
| `settle`        | Moving pieces with `table.command`, including a face-down card the referee knows by stand-in id |
| `referee`       | A `message` prompt anchored to the score track, and waiting for everyone to dismiss it          |

`test/referee.test.ts` plays a whole game against a real table. In this repository it runs with the other tests (`pnpm test`), with `trayful/engine` taken from [`packages/engine-client`](../../packages/engine-client).

See [Run your game with an engine](../../docs/howto/game-engine.md) for the client and the protocol.
