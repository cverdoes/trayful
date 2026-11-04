---
title: Someone opens a project with trayful play
kind: interaction
order: 1
summary: From a command line to a table in the browser, through all five packages.
---

`trayful play my-game` turns a folder of YAML files into a table in the browser. Every package takes part, each in its own layer.

## Steps

1. **The CLI reads the command line.** [[trayful:play]] goes through [[cli:run]], which hands the options parsed by [[cli:parsePlayArgs]] to [[cli:play]]. Its only job is to start the server, print where the table is, and open a browser (or a tunnel, with `--tunnel`).
2. **The server opens a workspace.** [[server:startServer]] calls [[server:Workspace|Workspace.open]], which finds the project or projects in the folder and starts watching their files for changes.
3. **The files are loaded and checked.** For each project the workspace calls [[formats:loadProject]]. It validates every file against the Zod schemas in [[formats/schemas.ts]], checks cross-references, and expands the inventory into components with stable ids. Problems come back as diagnostics with file and line, never as a crash; the result is a [[formats:ResolvedProject]].
4. **A table is opened.** The workspace opens a [[server:TableSession]] for the table (default `table-1`). A saved table in `tables/` is read and brought in line with the files by [[core:syncTable]]; a new one is made by [[core:createTable]], which puts every component in the box on the table and runs the setup's steps as ordinary commands. The session wraps the state in a [[core:TableEngine]].
5. **The server listens.** [[server/server.ts]] registers the routes: the built app from [[server/routes/files.ts]], the JSON API, the WebSocket at [[route:GET /ws]] and MCP at [[route:POST /mcp]]. It listens on `127.0.0.1` only, unless asked to share.
6. **The browser starts the app.** [[app/main.tsx]] calls [[app:start]], which asks [[route:GET /api/me]] who this browser is. The host, on the same computer, is let straight in.
7. **The app loads the project and connects.** [[app:connect]] fetches the component types and assets from [[route:GET /api/project]] and opens the WebSocket. [[server:registerSocket]] answers with a [[message:state]] message, the table as this player may see it, and subscribes the socket to every later change.
8. **The table is drawn.** The store in [[app/store.ts]] keeps the view, and [[app/Table.tsx]] draws each piece from its type's faces with [[app/render/Component.tsx]].

## Roles

- [[cli]] parses and starts; it holds no state.
- [[server]] owns the files, the tables and who may see what.
- [[formats]] is the only code that reads project files.
- [[core]] makes and changes tables, with no knowledge of files, sockets or screens.
- [[app]] draws what it is sent.
