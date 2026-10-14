# @trayful/server

The local Trayful server. It serves a workspace of projects, keeps every browser looking at a table in sync, reloads projects when their files change, and lets agents play and author over MCP.

```ts
import { startServer } from '@trayful/server';

const server = await startServer({
  projectDir: 'examples', // one project folder, or a folder of projects
  project: 'harvest-moon', // which project agents start on
  table: 'table-1',
  port: 4317,
});
console.log(server.url);
await server.close(); // saves every open table first
```

## Workspace

`Workspace` in `workspace.ts` holds the projects and their open tables:

- The root is either one project folder (with a `trayful.yaml`) or a folder whose sub-folders are projects. Projects are addressed by folder name.
- `table(project, name)` opens a table, creating it from the project and its setup if it is not saved yet. `duplicateTable`, `deleteTable` and `tables` manage the saved ones in each project's `tables/` folder. `active` is the table agents play on.
- Project folders are watched. On save, the project is reloaded and every open table switches to the new definitions (`TableSession.setProject`): changed components redraw, new ones arrive and removed ones leave, as one undoable step (`syncTable` in core). A project that no longer loads keeps its last good version, and its tables are told the problems.
- `createProject(name)` copies [`examples/starter`](../../examples/starter), as `trayful new` does through `createProjectFolder`.

`authoring.ts` changes project files for agents: `upsertType`, `removeType`, `setInventory` and `addAsset`. Edits go through the YAML document API, so comments and formatting elsewhere stay. After each edit the project is reloaded; if it no longer loads, the files are put back and an `AuthoringError` lists the problems.

## Routes

| Route                                    | What it serves                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `/`                                      | The built browser app from `packages/app/dist` (503 with a hint until built)     |
| `/ws?project=&table=`                    | WebSocket: send `ClientMessage`s (commands, undo, redo, reset), get table states |
| `/api/project?project=&table=`           | Project name, palette, component types and setups, for one table                 |
| `/api/table?project=&table=`             | A table's state                                                                  |
| `/api/projects`                          | Every project with its tables and any problems                                   |
| `/api/components?project=`               | Every component in the box, for print-and-play                                   |
| `POST /api/tables`, `DELETE /api/tables` | Create, duplicate (`from`) or delete a table                                     |
| `/mcp`                                   | MCP over Streamable HTTP (POST), for agents                                      |
| `/api/health`                            | `{ ok, project, projectDir, root, table }` for the active table                  |
| `/project-files/<project>/<path>`        | Images from a project folder (other file types are refused)                      |

Without `project` and `table`, routes use the active table. Tables are saved to `tables/<name>.json` shortly after every change, through a temporary file, so a crash never leaves half a file.

The server binds to `127.0.0.1` and refuses WebSocket, MCP and table-changing requests from pages on other origins, so other websites open in your browser cannot drive the table.

## MCP

`createMcpServer(workspace)` in `mcp.ts` builds the MCP server. Tools act on the active table:

- Reading: `describe_table`, `query_objects`, `snapshot`.
- Playing: `move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `take`, `layout`, `shuffle`, `roll`, `set_counter`, `lock`, with snap targets such as `main-board/market/2` wherever a position goes.
- History: `undo`, `redo`, `get_history`, `reset_table`.
- Projects and tables: `list_projects`, `open_table`, `duplicate_table`, `delete_table`, `create_project`, `validate_project`.
- Authoring: `upsert_type`, `remove_type`, `set_inventory`, `add_asset`, `render_component`.

Resources: `trayful://projects`, each table's state and PNG snapshot, each project's manifest and component types, the JSON Schemas (`trayful://schema`), and the [docs](../../docs) (`trayful://docs` and `trayful://docs/<path>`, from `docs.ts`).

Tools send the same commands as the browser, through the same session, so people see agent moves live and share one undo history. Each tool call changes all or nothing. `/mcp` serves it over HTTP; `trayful mcp` in the CLI serves it over stdio. Pictures (`snapshot`, `render_component`) are drawn by a browser that has the table open: the server asks over the WebSocket and the browser answers with a PNG.

Test with `pnpm vitest run packages/server` from the repo root.
