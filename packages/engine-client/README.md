# @trayful/engine-client

The client engines use: programs that run a game at a Trayful table. It is published inside the `trayful` npm package as `trayful/engine`, with its own type declarations, so it imports no other workspace package. See [Run your game with an engine](../../docs/howto/game-engine.md) for how to use it.

- `knock(url, name, { project, table })` asks the host to let an engine in and waits for their answer. It returns the credentials the engine connects with, or throws a `KnockRefused` whose `reason` is `denied`, `expired`, `busy` or `invalid`.
- `TableConnection.open(credentials, { since })` opens the table's WebSocket with the engine's bearer credential, waits for the first state, and follows the event feed. It keeps `state`, `players` and `next` (the last event heard) up to date, and tells listeners added with `on` about each `state`, `event`, `players`, unrequested `error` and `close`.
- `command`, `ask` and `answers` turn requests into promises: a command resolves on `done`, a prompt on `asked`, and `answers` once the prompt closes, with what each player answered. Errors with the request's id reject them.
- `src/protocol.ts` spells out the messages and the table's shape, mirroring core's `views/protocol.ts`. `test/protocol.test.ts` fails to compile when the two drift apart.
- `scripts/package.ts` bundles `src/index.ts` into `engine.mjs` and writes the declarations into `engine/` in the package.
