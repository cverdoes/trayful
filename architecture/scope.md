---
title: What Trayful is, and is not
kind: onboarding
order: 1
summary: The problem Trayful solves, who uses it, and where its edges are.
---

## The problem

A board game designer changes their components dozens of times before a prototype is worth printing. Trayful lets them describe those components as files, or draw them in a browser designer, and play with them at once on a shared table: alone, with playtesters over the network, or with an AI agent that reads and moves the pieces through the Model Context Protocol (MCP).

## Who uses it

| Who                 | What they do                                                                                   | Where they come in                                      |
| ------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Game designer       | Writes or designs components, setups and decks; plays the table; invites others.               | [[trayful:play]], the browser app, a text editor        |
| Playtester          | Opens an invite link and plays with a private hand. Needs no install.                          | the browser app, [[concept:join-by-invite\|an invite]]  |
| AI agent            | Builds components and plays as player `claude`, through MCP tools.                             | [[trayful:mcp]], [[route:POST /mcp]]                    |
| Game engine         | A program that runs a game's rules: it watches the table and asks players to choose. Advisory. | [[concept:an-engine-knocks\|a knock]], `trayful/engine` |
| Trayful contributor | Works on this repository.                                                                      | these pages, the README                                 |

## In scope

- **A prototyping table.** Drag, flip, rotate, stack, shuffle, deal into hands, roll, snap onto boards, undo. Everything a physical table does, without knowing any game's rules.
- **Components as files.** A project folder of YAML and CSV, readable, diffable, in version control, with errors reported by file, line and column. See [[format:manifest]].
- **A designer.** Browser pages that edit those same files, keeping their comments.
- **Playing together.** Several players at one table, each with a private hand and their own undo, joining by invite link over the local network or a tunnel.
- **Agents and engines as participants.** An MCP server for agents, and a WebSocket role for rule engines, both going through the same commands as people.
- **Print and play.** Every component at real size, for paper.

## Out of scope, on purpose

- **Rules.** The table never knows whose turn it is or which move is legal. A player can do anything a person could do with real pieces. Rules live with people, with an agent, or with an engine that only advises: it may ask and highlight, never refuse a move. See [[concept:decisions]].
- **Accounts and a hosted service.** Trayful runs on the designer's own computer. There are no user accounts, no database and no cloud storage. Someone at the same computer is the host; everyone else is a guest by invite. A hosted service may come later, so code should not make it impossible (for example, by assuming one host per process in places that do not need to), but it is not being built.
- **Publishing finished games.** Trayful is for the time before a game is done. It is not a storefront or a rules-enforcing digital edition.
- **Drawing tools.** The designer places images, text and shapes; artwork is made elsewhere and dropped in.

## Licence

Trayful is source-available under the Functional Source License 1.1 with an MIT future licence (FSL-1.1-MIT, `LICENSE.md`). Anyone may use, change and share it, including for games they sell, but not offer it as a competing commercial product or paid hosted service. Each release becomes MIT two years after publication. Add no dependency whose licence conflicts with that; the npm package lists the licences of everything it bundles.

## How people get it

| Channel | What it is                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------- |
| npm     | One public package, `trayful`: the CLI with the server, the built app and the engine client. `npx trayful play` |
| Docker  | `Dockerfile` and `compose.yaml`: the server in a container, its port published on this computer only.           |
| A clone | `pnpm install`, `pnpm build`, `pnpm trayful play examples/harvest-moon`.                                        |

Next: [[concept:system\|how it runs]].
