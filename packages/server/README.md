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
| `/mcp`                  | MCP over Streamable HTTP (POST), for agents                                      |
| `/api/health`           | `{ ok, project, projectDir, table }`                                             |
| `/project-files/<path>` | Images from the project folder (other file types are refused)                    |

The table lives in `tables/<name>.json` in the project folder. It is loaded on start (or created from the inventory), and written shortly after every change through a temporary file, so a crash never leaves half a file.

The server binds to `127.0.0.1` and refuses WebSocket and MCP requests from pages on other origins, so other websites open in your browser cannot drive the table.

## MCP

`createMcpServer(session)` in `mcp.ts` builds the MCP server: tools for reading (`describe_table`, `query_objects`, `snapshot`), playing (`move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `shuffle`, `roll`, `set_counter`, `lock`) and history (`undo`, `redo`, `get_history`, `reset_table`), plus resources for the table state, a PNG snapshot, the project, each component type and the JSON Schemas. Tools send the same commands as the browser, through the same session, so people see agent moves live and share one undo history. Each tool call changes all or nothing.

`/mcp` serves it over HTTP; `trayful mcp` in the CLI serves it over stdio. Snapshots are drawn by a browser that has the table open: the server sends `snapshot-request` over the WebSocket and the browser answers with a PNG.

Test with `pnpm vitest run packages/server` from the repo root.
