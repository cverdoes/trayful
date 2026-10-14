# @trayful/core

The table engine: state, commands, undo and seeded randomness. It has no UI or file system code, so the browser app, the MCP server and tests all share it.

- `createTable(project, { name, seed, setup })` spawns every inventory component (decks become face-down stacks), then runs the setup: the one named, else the manifest's `setup`; `setup: false` skips it. Components the setup leaves out wait in rows below it. Setup steps run through the same commands as play, in `setup.ts`; a bad step throws `SetupError` naming the step.
- `applyCommand(state, command, catalog)` returns a new state for one of: `move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `take`, `layout`, `shuffle`, `roll`, `setValue`, `lock`. Invalid commands throw `CommandError` and change nothing.
- `move`, `draw`, `deal` and `take` go to a position or to a snap target: `owner/target/index` for one spot, `owner/target` for its free spots in order (or its free area). Snapped pieces remember their spot in `snap`, and ride along when the piece that holds the spot moves or rotates.
- `snap.ts` resolves snap targets (`resolveSpots`, `allSpots`) and finds where a dropped piece snaps (`snapFor`); `layout.ts` gives the geometry of fanned and spread-out stacks.
- `TableEngine` wraps a state with undo, redo, a command history and change listeners. Changes carry the player who made them (`dispatch(command, player)`), and `undo(player)` and `redo(player)` take back only that player's own last change, even with others' changes after it: just the pieces it touched are put back, and a `CommandError` says so when someone has changed those pieces since. `canUndoFor(player)` and `canRedoFor(player)` tell whether a player can.
- `describeTable` and `queryObjects` in `describe.ts` give agents a text or JSON view of the table. Face-down cards stay hidden unless asked with `reveal`.
- `replace(state)` on the engine swaps in a whole new table (a reset) as one undoable step; `setCatalog(types)` switches to reloaded component types.
- `syncTable(state, project)` brings a table up to date with edited project files: components that left the box leave the table, changed data applies in place, and new components join their deck or wait in rows below the table.
- Pieces can sit in a player's private hand (`hand: <player>`): `hand:<player>` as a target puts them there, and moving them `to` a place plays them. `onTable`, `handOf` and `handCounts` in `state.ts` tell where pieces are.
- `viewFor(state, player, aliases)` in `privacy.ts` is what one player may see: other hands left out, face-down pieces without their data and under stand-in ids from an `AliasBook`, no random state. `resolveAliases` maps stand-in ids in a player's command back to real ones.
- `ClientMessage` and `ServerMessage` in `protocol.ts` are the WebSocket messages between the browser and the server.
- `toTableFile` and `fromTableFile` convert to and from the saved JSON form, checking stack consistency on load.

Shuffles and rolls draw from a random state stored in the table, so the same seed and commands always give the same result.

```ts
import { createTable, TableEngine } from '@trayful/core';

const engine = new TableEngine(createTable(project, { name: 'playtest', seed: 42 }), project.types);
engine.dispatch({ type: 'shuffle', id: 'deck:actions' }, 'alice');
engine.dispatch({ type: 'roll', id: 'die.1' }, 'bob');
engine.undo('alice'); // puts the deck back in order, leaves Bob's roll
```

Test with `pnpm vitest run packages/core` from the repo root.
