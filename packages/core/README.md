# @trayful/core

The table engine: state, commands, undo and seeded randomness. It has no UI or file system code, so the browser app, the MCP server and tests all share it.

- `createTable(project, { name, seed })` spawns every inventory component; decks become face-down stacks.
- `applyCommand(state, command, catalog)` returns a new state for one of: `move`, `flip`, `rotate`, `stack`, `draw`, `shuffle`, `roll`, `setValue`, `lock`. Invalid commands throw `CommandError` and change nothing.
- `TableEngine` wraps a state with undo, redo, a command history and change listeners.
- `replace(state)` on the engine swaps in a whole new table (a reset) as one undoable step.
- `ClientMessage` and `ServerMessage` in `protocol.ts` are the WebSocket messages between the browser and the server.
- `toTableFile` and `fromTableFile` convert to and from the saved JSON form, checking stack consistency on load.

Shuffles and rolls draw from a random state stored in the table, so the same seed and commands always give the same result.

```ts
import { createTable, TableEngine } from '@trayful/core';

const engine = new TableEngine(createTable(project, { name: 'playtest', seed: 42 }), project.types);
engine.dispatch({ type: 'shuffle', id: 'deck:actions' });
engine.dispatch({ type: 'draw', from: 'deck:actions', count: 1, to: [100, 100], face: 'up' });
engine.undo();
```

Test with `pnpm vitest run packages/core` from the repo root.
