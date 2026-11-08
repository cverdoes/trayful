---
title: How it runs
kind: onboarding
order: 2
summary: One Node process, a folder of files, and the browsers, agents and engines that connect to it.
---

## The picture

```text
 project folder on disk                one Node.js process: trayful play
 ───────────────────────               ─────────────────────────────────────────────
 trayful.yaml, libraries,   ─ read ─►  Workspace ── loads ──► ResolvedProject
 inventory, assets, setups  ◄─ edit ─    │ watches the files, reloads on change
 tables/<name>.json         ◄─ save ─  TableSession (one per open table)
                                         │ TableEngine: state, history, undo
                                         │ viewFor(player): what each one may see
                                       Fastify on 127.0.0.1:4317
                                         ├─ static files: the built browser app
                                         ├─ /api/…   HTTP: projects, designer, invites
                                         ├─ /ws      WebSocket: table views out, commands in
                                         └─ /mcp     MCP over HTTP
      ▲                ▲                    ▲                 ▲
  browser app      browser app       trayful mcp (stdio)   engine (trayful/engine)
  (the host)       (a guest, by      relays an agent such  over /ws with a
                   invite or tunnel) as Claude Code        bearer credential
```

## The parts

- **The project folder is the database.** [[formats:loadProject]] reads it into a [[formats:ResolvedProject]]. Tables are saved as JSON next to it, in `tables/`, a quarter second after the last change ([[server/play/tableFiles.ts]]). There is no other storage.
- **One process serves one workspace.** [[server:startServer]] opens a [[server:Workspace]] (a project, or a folder of projects), and serves everything on one port, 4317 by default. The workspace watches the project files, so a saved edit shows on open tables at once.
- **The server owns every table.** Each open table is a [[server:TableSession]] holding a [[core:TableEngine]]. Every change arrives as a [[core:Command]]; the session applies it, saves, and sends each connection its own [[core:TableView]].
- **The browser app is static files.** [[app]] is built by Vite into `packages/app/dist` and served by the same process. It keeps no state of its own that matters: reload the page and the table comes back from the server.
- **Agents speak MCP.** [[trayful:mcp]] runs an MCP server on stdin and stdout for a client such as Claude Code. If `trayful play` already has the project open, it relays to that server, so people and the agent share one table; otherwise it opens the table itself. [[route:POST /mcp]] offers the same tools over HTTP. See [[concept:an-agent-plays]].
- **Engines join over the WebSocket.** A rule engine knocks with [[route:POST /api/knock]], the host allows it, and it then follows the table and asks players to choose. See [[concept:an-engine-knocks]].

## Who may connect

The server listens on `127.0.0.1` unless told otherwise, so only this computer can reach it. A request from this computer is the **host**, who may do anything. Everyone else is a **guest** and needs an invite link to one table; `trayful play --share` listens on the local network and `--tunnel` opens a Cloudflare quick tunnel ([[cli/tunnel.ts]]). [[server/play/access.ts]] decides who a request comes from, and treats a request carrying proxy headers as remote even when it arrives on the loopback. In Docker, `--container` treats the container's gateway as this computer and the compose file publishes the port on the loopback only.

## What runs where

| Code              | Runs in                                  | May use                                                                   |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| [[formats]]       | Node, and the browser (`/browser` entry) | the file system, in its loader only                                       |
| [[core]]          | Node and the browser                     | nothing outside itself: no I/O, no clock, no `Math.random`                |
| [[server]]        | Node                                     | the file system, the network                                              |
| [[app]]           | the browser                              | the server, over HTTP and the WebSocket                                   |
| [[cli]]           | Node                                     | everything above, and child processes (`cloudflared`, the browser opener) |
| [[engine-client]] | Node, in someone else's program          | only the server, over the WebSocket                                       |

Next: [[concept:technology\|the technology]].
