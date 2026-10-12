# @trayful/server

The local Trayful server. It opens one table of a project and keeps every connected browser in sync.

```ts
import { startServer } from '@trayful/server';

const server = await startServer({
  projectDir: 'examples/harvest-moon',
  table: 'table-1',
  port: 4317,
});
console.log(server.url);
await server.close(); // saves the table first
```

| Route                   | What it serves                                                                   |
| ----------------------- | -------------------------------------------------------------------------------- |
| `/`                     | The built browser app from `packages/app/dist` (503 with a hint until built)     |
| `/ws`                   | WebSocket: send `ClientMessage`s (commands, undo, redo, reset), get table states |
| `/api/project`          | Project name, palette and component types                                        |
| `/api/table`            | The current table state                                                          |
| `/api/health`           | `{ ok, project, table }`                                                         |
| `/project-files/<path>` | Images from the project folder (other file types are refused)                    |

The table lives in `tables/<name>.json` in the project folder. It is loaded on start (or created from the inventory), and written shortly after every change through a temporary file, so a crash never leaves half a file.

The server binds to `127.0.0.1` and refuses WebSocket connections from pages on other origins, so other websites open in your browser cannot drive the table.

Test with `pnpm vitest run packages/server` from the repo root.
