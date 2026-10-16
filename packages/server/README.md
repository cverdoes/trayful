# @trayful/server

The local Trayful server. It serves a workspace of projects, keeps every browser looking at a table in sync (each seeing only what their player may), lets invited guests join, reloads projects when their files change, and lets agents play and author over MCP.

```ts
import { startServer } from '@trayful/server';

const server = await startServer({
  projectDir: 'examples', // one project folder, or a folder of projects
  project: 'harvest-moon', // which project agents start on
  table: 'table-1',
  port: 4317,
  host: '0.0.0.0', // optional: let others on the network join
});
console.log(server.url, await server.inviteLinks()); // invite links to the active table
await server.close(); // saves every open table first
```

## Workspace

`Workspace` in `workspace.ts` holds the projects and their open tables:

- The root is either one project folder (with a `trayful.yaml`) or a folder whose sub-folders are projects. Projects are addressed by folder name.
- `table(project, name)` opens a table, creating it from the project and its setup if it is not saved yet. `duplicateTable`, `deleteTable` and `tables` manage the saved ones in each project's `tables/` folder. `active` is the table agents play on.
- Project folders are watched. On save, the project is reloaded and every open table switches to the new definitions (`TableSession.setProject`): changed components redraw, new ones arrive and removed ones leave, as one undoable step (`syncTable` in core). A project that no longer loads keeps its last good version, and its tables are told the problems.
- `createProject(name)` copies [`examples/starter`](../../examples/starter), as `trayful new` does through `createProjectFolder`.

`authoring.ts` changes project files for agents: `upsertType`, `removeType`, `setInventory` and `addAsset`. Edits go through the YAML document API, so comments and formatting elsewhere stay. After each edit the project is reloaded; if it no longer loads, the files are put back and an `AuthoringError` lists the problems. A project still in `trayful/1` is refused (`requireCurrentFormat`) until it is migrated.

`migrate.ts` rewrites a `trayful/1` project in the current format (`migrateFolder`), for `trayful migrate`, the `migrate_project` tool and `POST /api/migrate`. Libraries are written afresh, keeping their header comments; images and palette colours go to a new assets file; the manifest, inventory and setups are patched in place, keeping their comments. A project that is already current or does not load raises a `MigrateError`.

## Players and access

`players.ts` keeps the players of a workspace (`Players`): the host, guests and the agent player `claude`. They are stored through a `PlayerStore`; `FilePlayerStore` writes `.trayful/players.json` in the served folder, and a hosted service could keep them elsewhere behind the same interface. Each guest proves who they are with a secret in an HttpOnly cookie; only its SHA-256 fingerprint is stored. The same file keeps one invite per table (`invite(project, table)`, made on first use; `renew` replaces its token), and the tables each guest was invited to (`grant`), so a guest keeps their tables when an invite is renewed.

`access.ts` decides who a request is from:

- A request from this computer (a loopback address, a loopback `Host`, and no proxy headers such as `x-forwarded-for`) is the host, even without a cookie. Tunnels add proxy headers, so requests through them never count as local, and the `Host` check stops DNS rebinding.
- Anyone else may reach only the tables they were invited to: by an invite in their invite cookie (set by `/join/<invite>`), or granted to their player when they joined. Other tables, their routes and their socket answer 403, and `/api/projects` lists only their tables (`allowed` and `allowedProject`).
- Requests that change something must come from a Trayful page: a local origin, or for guests the address they reached the server at.

`TableSession` sends every watcher their own view of the table (`viewFor` in core): other hands left out, face-down pieces under stand-in ids. Commands from a player go through `act`, which swaps stand-in ids back, refuses pieces in other players' hands, and labels the change with the player's name for the others. Watchers who have not joined yet may look but not play.

## Routes

| Route                                           | What it serves                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                             | The built browser app from `packages/app/dist` (503 with a hint until built)                                                               |
| `/ws?project=&table=`                           | WebSocket: send `ClientMessage`s (commands, undo, redo, reset), get table states as this player sees them, and who is playing              |
| `/api/project?project=&table=`                  | Project name, assets (images and colours), components, setups, and whether it is in `trayful/1` (`legacy`), for one table                  |
| `/api/table?project=&table=`                    | A table's state, as the asking player sees it                                                                                              |
| `/api/projects`                                 | Every project with its tables and any problems                                                                                             |
| `/api/components?project=`                      | Every component in the box, for print-and-play (host only)                                                                                 |
| `POST /api/tables`, `DELETE /api/tables`        | Create, duplicate (`from`) or delete a table (host only)                                                                                   |
| `/api/me`, `POST /api/me`                       | Who this browser plays as, and whether it is the host; rename                                                                              |
| `POST /api/join`                                | Join under a name, with an invite; sets the player cookie                                                                                  |
| `/join/<invite>`                                | An invite link: adds the invite to the invite cookie and opens its table                                                                   |
| `POST /api/invites`                             | Invite links to one table (`project`, `table`), or new ones with `renew` (host only)                                                       |
| `/api/library?project=`                         | Each library file with its content hash, and the file of each type, for saving without conflicts (host only)                               |
| `PUT /api/types/<id>`, `DELETE /api/types/<id>` | Save a type from the designer (`definition`, `file`, `baseHash`; 409 when the file changed) or remove it (host only)                       |
| `POST /api/types/<id>/rename`                   | Give a type a new id (`to`) in the library, inventory and setups; answers the new `id` and the library, as `/api/library` does (host only) |
| `POST /api/types/<id>/fields/<field>/rename`    | Rename a field (`to`) in the type, its faces, its inventory rows and CSV headers; answers the new `field` and the library (host only)      |
| `POST /api/migrate?project=`                    | Rewrite a `trayful/1` project in the current format; answers the `files` written (host only)                                               |
| `PUT /api/assets`                               | Save an image dropped onto the designer (`file`, `base64`, up to 20 MB) under an unused name; answers `{ file }` (host only)               |
| `/mcp`                                          | MCP over Streamable HTTP (POST), for agents on this computer only                                                                          |
| `/api/health`                                   | `{ ok, project, table }` for the active table, plus `projectDir` and `root` for the host                                                   |
| `/project-files/<project>/<path>`               | Images from a project folder (other file types are refused)                                                                                |

The routes live in `src/routes/`, one module per group, sharing a `RouteContext`; `guards.ts` checks origins and invites before any route runs. Without `project` and `table`, routes use the active table. Tables are saved to `tables/<name>.json` shortly after every change, through a temporary file, so a crash never leaves half a file.

The server binds to `127.0.0.1` unless told otherwise (`trayful play --share` binds `0.0.0.0`; `--tunnel` keeps `127.0.0.1` and lets `cloudflared` connect locally). `addShareBase(url)` adds an address, such as a tunnel's, to the invite links.

## MCP

`createMcpServer(workspace)` in `mcp.ts` builds the MCP server from the tool groups in `src/mcp/` (reading, play, tables, authoring, resources), which share a `ToolContext`. Tools act on the active table:

- Reading: `describe_table`, `query_objects`, `snapshot`.
- Playing: `move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `take`, `layout`, `shuffle`, `roll`, `set_counter`, `lock`, with drop areas such as `main-board/market/2` wherever a position goes.
- History: `undo`, `redo`, `get_history`, `reset_table`.
- Projects and tables: `list_projects`, `open_table`, `duplicate_table`, `delete_table`, `create_project`, `validate_project`.
- Authoring: `upsert_type`, `rename_type`, `remove_type`, `set_inventory`, `add_asset`, `render_component`, `migrate_project`.

Resources: `trayful://projects`, each table's state and PNG snapshot, each project's manifest and components, the JSON Schemas (`trayful://schema`), and the [docs](../../docs) (`trayful://docs` and `trayful://docs/<path>`, from `docs.ts`).

Agents play as player `claude`: `describe_table` and `query_objects` (`inside: "hand:claude"`) show their own hand and only counts of other hands, moves to `hand:<player>` deal into hands, and `get_history` names pieces in other hands only as hidden. Tools send the same commands as the browser, through the same session, so people see agent moves live. `undo` and `redo` take back only the agent's own moves, just as each person undoes only theirs. Each tool call changes all or nothing. `/mcp` serves it over HTTP; `trayful mcp` in the CLI serves it over stdio. Pictures (`snapshot`, `render_component`) are drawn by a browser that has the table open: the server asks over the WebSocket and the browser answers with a PNG.

Test with `pnpm vitest run packages/server` from the repo root.
