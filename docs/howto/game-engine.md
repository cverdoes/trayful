# Run your game with an engine

An engine is a program you write that runs your game at the table: it follows what players do, moves pieces, and asks them questions. A referee that deals each round and asks who goes first, or a tutorial that explains each step. Trayful keeps the rules out of the table, so the engine can be written in any language that speaks WebSocket and JSON.

Engines only advise. Players can still move any piece; the engine reacts to what happened.

If you would rather have Claude run the game from your rules, see [Use Trayful from your game's repository](game-repository.md) instead: no code needed.

## In JavaScript or TypeScript

The `trayful` package comes with a client for engines, with type declarations. Install it in your engine's project (it needs Node.js 22 or newer) with `npm install trayful`, start the table with `trayful play`, and open it in your browser.

```js
import { knock, TableConnection } from 'trayful/engine';

// Asks you to let the engine in. You see a prompt from Trayful above your hand:
// Allow, Allow with full view, or Deny. This waits up to a minute and a half.
const credentials = await knock('http://127.0.0.1:4317', 'Referee');

const table = await TableConnection.open(credentials);
table.on('event', (event) => {
  if (event.kind === 'changed') console.log(`${event.name} ${event.text}`);
});

// Moves pieces with the same commands the browser sends.
await table.command({ type: 'shuffle', id: 'deck:actions' });

// Asks players, and waits for their answers.
const prompt = await table.ask('everyone', {
  kind: 'choice',
  text: 'Who goes first?',
  options: [
    { id: 'ann', label: 'Ann' },
    { id: 'bo', label: 'Bo' },
  ],
});
const { answers } = await table.answers(prompt.id);
```

`knock` throws a `KnockRefused` when you deny the engine or do not answer in time; its `reason` says which. Keep the credentials it returns (such as in a file the engine reads at start): they work from then on without knocking again, until you send the engine away.

`table.state` is always the table as the engine last saw it, and `table.players` who is there. Listen with `table.on('state' | 'event' | 'players' | 'error' | 'close', …)`. A command or prompt the server refuses rejects with its reason. `table.next` is the last event heard: pass it as `since` to `TableConnection.open` after a restart to hear what the engine missed.

With a full view the engine sees every hand and every face-down card, as a referee may need to. Without one it sees what a player with no hand of their own would, and hears only the answers to its own prompts.

## In any other language

The client is a thin layer over HTTP and a WebSocket carrying JSON, which any language can speak.

### Knock

Start the table with `trayful play`, open it in your browser, and have the engine ask to join:

```sh
curl -X POST http://127.0.0.1:4317/api/knock \
  -H 'content-type: application/json' \
  -d '{"name": "Referee"}'
```

You see a prompt from Trayful above your hand: **Allow**, **Allow with full view**, or **Deny**. The request waits up to a minute and a half for your answer. On Allow, it answers with the engine's player id and its secret:

```json
{
  "status": "allowed",
  "player": { "id": "referee", "role": "engine" },
  "secret": "…",
  "fullView": false
}
```

Keep the secret: the engine connects with it from now on, without knocking again. Pass `project` and `table` in the body to knock at a table other than the one open.

### Connect and follow the table

The engine opens the same WebSocket the browser uses, with its id and secret. A secret that no longer works is refused with 403.

```js
// Node 22 and later have WebSocket built in, and let it send headers.
const socket = new WebSocket('ws://127.0.0.1:4317/ws', {
  headers: { authorization: `Bearer referee:${secret}` },
});
socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'follow' })));
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === 'events') for (const event of message.events) react(event);
});
```

After `follow`, every move, undo, answer and player coming or going arrives as an `events` message. Each event has a `seq`; send `{ "type": "follow", "since": 41 }` after reconnecting to get what you missed. The engine also gets `state` messages with the whole table, as the browser does.

### Ask players, and move pieces

Ask with an `ask` message. The prompt is the same as the agent's `prompt` tool takes: a `kind` (`message`, `confirm`, `choice`, `pick`, `place`, `number` or `text`), `text`, and `options`, `candidates`, `anchor` or `highlight` as the kind needs.

```json
{
  "type": "ask",
  "requestId": "first-player",
  "to": "everyone",
  "until": "first",
  "prompt": {
    "kind": "choice",
    "title": "New round",
    "text": "Who goes first?",
    "options": [
      { "id": "ann", "label": "Ann" },
      { "id": "bo", "label": "Bo" }
    ]
  }
}
```

The server answers with `asked` (or an `error` with the same `requestId`), then each answer arrives as an `answered` event. An engine without a full view hears only the answers to its own prompts. Withdraw a prompt with `{ "type": "cancel-prompt", "prompt": "<id>" }`.

Move pieces with the same `command` messages the browser sends, such as `{ "type": "command", "requestId": "deal-1", "command": { "type": "deal", "from": "deck:actions", "to": ["hand:ann", "hand:bo"], "count": 2 } }`. With a `requestId` the server answers `done`, or an `error` with the same id. Every message, and what each command takes, is in [`protocol.ts`](https://github.com/cverdoes/trayful/blob/main/packages/engine-client/src/protocol.ts), the types the client is written against.

## Sending an engine away

The engine shows in the players list at the top of the table. Click the × next to its name to send it away: it is cut off, its secret stops working, and it must knock again to come back.
