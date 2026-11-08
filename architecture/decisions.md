---
title: The decisions behind the shape
kind: onboarding
order: 4
summary: The architectural choices that shape the code, why they were made, and what they cost.
---

Each entry is a short decision record: what was decided, why, what it costs, and where to see it. Changing one of these is a design discussion, not a refactoring.

## 1. Local first, one process, no database

**Decision.** `trayful play` is one Node process on the designer's own computer. It serves one workspace, keeps open tables in memory, and stores everything as files: the project folder, and each table as `tables/<name>.json` beside it.

**Why.** Designers keep their prototypes in folders and in git. Nothing to install or sign up for, no data leaves the computer unless they invite someone, and a project can be zipped and sent.

**Cost.** One process owns a table; there is no sharing a table across servers. A hosted service would need storage behind an interface, accounts, and a single owner per live table. Keep that door open: do not spread file paths through code that does not need them.

**Where.** [[server:Workspace]], [[server/play/tableFiles.ts]], [[concept:system]].

## 2. Project files are the truth, and humans own them

**Decision.** What exists (component types, the inventory, assets, setups) is defined only by YAML and CSV files in the project. [[formats]] is the only code that parses them. The designer and the MCP authoring tools change the files, never a copy, and they keep comments and layout.

**Why.** Files diff, merge and review like code, a person can always fix one by hand, and an agent in another repository can drive the same project.

**Cost.** Every authoring feature is a careful edit of a YAML document, not an update of an object. Tables follow the inventory, so a renamed piece needs care on tables already saved.

**Where.** [[formats:loadProject]], [[server/projects/yaml-patch.ts]], [[core:syncTable]], [[concept:design-a-component]].

## 3. The schemas are the single source for the formats

**Decision.** Each file kind is a Zod schema in [[formats/schemas/index.ts]]. TypeScript types, validation errors, JSON Schemas for editors and the reference pages in `docs/reference/` all come from it. `pnpm generate` writes the generated files and CI fails when they are stale.

**Why.** A format described in four places drifts. One schema keeps the editor, the loader and the docs in step.

**Cost.** Schema changes need `pnpm generate` and an updated example in the same change. Breaking changes need a new format version.

**Where.** [[formats:toJsonSchemas]], [[format:manifest]].

## 4. Formats carry a version, and old projects keep opening

**Decision.** A manifest names its format, such as `trayful/2`. The loader upgrades older formats in memory, and `trayful migrate` rewrites the files.

**Why.** Designers' projects outlive releases. Nobody should lose a prototype to an upgrade.

**Cost.** The upgrade code and the legacy schema stay until a format is retired.

**Where.** [[formats/loading/upgrade.ts]], [[trayful:migrate]].

## 5. Every change to a table is a command

**Decision.** A move, a flip, a draw, a shuffle or a mark is a [[core:Command]] applied by [[core:applyCommand]] to an immutable [[core:TableState]]. The browser, MCP tools, setups and engines all send commands; nothing changes a table any other way.

**Why.** One place validates, one place records history, and undo, multiplayer and agents work for every action without extra code. A new action is a new command, not a special case.

**Cost.** Every new gesture needs a command and its tests in [[core]] before it can appear in the app.

**Where.** [[core:TableEngine]], [[concept:drag-onto-a-row]], [[concept:undo]].

## 6. The core is pure and deterministic

**Decision.** [[core]] does no I/O, reads no clock and uses no `Math.random`. Randomness comes from a seeded generator whose state is stored in the table.

**Why.** The same commands on the same table give the same result, in the server, in the browser and in tests. Shuffles and rolls replay exactly for undo.

**Cost.** Anything that needs time or files lives in the server and passes values in.

**Where.** [[core/table/rng.ts]], `.dependency-cruiser.cjs` (core may not use Node built-ins).

## 7. The server holds the table, and each player sees their own view

**Decision.** A [[server:TableSession]] owns each table. It sends each connection a [[core:TableView]] made by [[core:viewFor]]: other players' hands and bags are only counts, and face-down pieces keep only what their back shows and get a stand-in id, so neither their text nor their id gives them away. The random generator's state is left out too, since it predicts shuffles.

**Why.** Hidden information is only hidden if it never reaches the browser. A player with developer tools must not be able to read another hand.

**Cost.** Features must be designed with privacy in mind: anything sent to a client goes through the view, and tools that name pieces must resolve stand-in ids.

**Where.** [[core/views/privacy.ts]], [[concept:draw-into-a-hand]], [[concept:join-by-invite]].

## 8. The browser only draws and asks

**Decision.** [[app]] renders the view it is sent and turns gestures into commands. It never changes the table itself and never imports the server; the two share only [[core]] and the browser entry of [[formats]].

**Why.** One authority means no conflicts to reconcile between players, and the app stays a thin client that a reload can always restore.

**Cost.** Every gesture waits for the server. That is fast on a local network; drag feedback is drawn locally while the command is on its way.

**Where.** [[app/connection.ts]], [[message:command]], `.dependency-cruiser.cjs` (server and app are independent).

## 9. Agents are players, through MCP

**Decision.** Agents connect through MCP and play as the player `claude`, with the same commands, views and undo as people. Authoring tools edit the same files as the designer.

**Why.** An agent at the table is a playtester, a game master or a component builder, and people see its moves live. Building it on the shared command layer means agents get every new feature.

**Cost.** Every feature needs an MCP tool or a reason not to have one; `packages/server/test/shipped/skill.test.ts` keeps the agent skill true to the tools.

**Where.** [[server:createMcpServer]], [[concept:an-agent-plays]], [[mcp:move]].

## 10. Engines advise; they never rule

**Decision.** A rule engine is a separate program that knocks, is allowed in by the host, and then watches the table and prompts players. It cannot refuse a move or lock the table, and sees only what a player would unless the host grants it the full view.

**Why.** The table stays a table: people can always fix a mistake by hand. Engines in any language can come and go without Trayful knowing a game's rules.

**Cost.** An engine must cope with moves it did not expect.

**Where.** [[concept:an-engine-knocks]], [[concept:ask-a-player]], [[engine-client]].

## 11. The host is whoever sits at the computer

**Decision.** No accounts. A request from this computer is the host; everyone else needs an invite link to one table. The server listens on the loopback unless asked to share.

**Why.** Playtesting with friends should take one link, not a sign-up, and a forgotten server should not be open to the network.

**Cost.** Requests through a tunnel or proxy must never count as local; [[server/play/access.ts]] checks forwarded headers and the `Host` header for that.

**Where.** [[server/play/access.ts]], [[concept:join-by-invite]].

## 12. Layers, enforced by tools

**Decision.** formats, then core, then server and app, then cli; the engine client stands alone. Inside a package, sub folders are ordered the same way. `pnpm lint:deps` fails on an import that points up.

**Why.** Each layer can be understood and tested without the ones above it, and the rule does not depend on reviewers remembering it.

**Cost.** Sometimes a type has to move down a layer before it can be shared.

**Where.** `.dependency-cruiser.cjs`, the layer picture on the [[concept:index\|home page]].

## 13. No build step for the packages; one bundle for npm

**Decision.** Packages are TypeScript run from source with tsx. Only the app is built (Vite). For release, `scripts/package.ts` bundles the CLI, server, core and formats with esbuild into the one public npm package, `trayful`, with the built app, the starter project, the schemas, the docs and the agent skill as resources. The engine client ships inside it as `trayful/engine`.

**Why.** No stale `dist/` folders during development, and one package for users to install with `npx`.

**Cost.** Files the server reads at run time must be listed as resources ([[server:RESOURCE_SOURCES]]) and the installed package is tested (`scripts/test-package.sh`) before each release.

**Where.** [[server/shipped/resources.ts]], [[trayful:skill]], the Releasing section of the README.

## 14. Quality limits are fixed, not negotiated

**Decision.** ESLint limits complexity and size, coverage has a floor per package, and knip, jscpd and dependency-cruiser run in CI. No rule is switched off with a comment or a suppressions file; code that breaks a limit is changed.

**Why.** Limits a tool enforces keep the code readable without depending on a reviewer to notice, and they apply the same way to code written by people and by agents.

**Cost.** Sometimes a function must be split where one long one would read fine.

**Where.** `eslint.config.js`, `vitest.config.ts`, [[concept:how-we-work]].
