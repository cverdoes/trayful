---
title: The technology
kind: onboarding
order: 3
summary: The language, runtime and libraries Trayful is built on, and why each one is there.
---

Trayful is TypeScript from end to end: one language for the file formats, the engine, the server, the browser and the tools. The [Libraries](../surfaces/libraries.html) page lists every library with its version and the modules that import it, read from the `package.json` files; this page says why each one is there. `pnpm docs:overview --check` fails when a library is added without a reason here.

## Language, runtime and workspace

- **TypeScript, strict, run from source.** [[npm:typescript]] only type-checks (`pnpm typecheck`); it never emits files. [[npm:tsx]] runs the `.ts` files directly in Node, for development, for the scripts and for `trayful` started from a checkout or in Docker, so there is no build step for the packages and no `dist/` to go stale. It is a runtime dependency of the CLI for that reason.
- **Node.js 22.12 or newer** (`.nvmrc`, `engines` in `package.json`), ES modules only. The npm package's launcher checks the version before it starts.
- **A pnpm workspace.** Six packages under `packages/`, linked with `workspace:*`. Packages are private; the only thing published is the bundle described under [[concept:decisions]].

## File formats

- [[npm:zod]] declares every file format once. The same schemas give the TypeScript types, validate files with readable errors, and are turned into JSON Schema and the reference pages by `pnpm generate` ([[formats:toJsonSchemas]]).
- [[npm:yaml]] parses project files with positions, so an error points at a line and column, and edits them as documents, so the designer keeps people's comments and layout ([[server/projects/yaml-patch.ts]]). The app uses it for its YAML pane.
- [[npm:csv-parse]] reads card data from spreadsheets exported as CSV.
- [[npm:tinyglobby]] finds the files a manifest names with globs. It replaced fast-glob for a smaller, audited dependency tree.

## Server

- [[npm:fastify]] serves the HTTP API, the static app and the WebSocket in one process. It is small and fast, and each extra need is an official plugin. [[npm:@fastify/static]] serves the built app and project images; [[npm:@fastify/websocket]] carries table views and commands.
- [[npm:@modelcontextprotocol/sdk]] is the official MCP SDK. The server uses it to offer tools over stdio and HTTP; the CLI uses its client to relay `trayful mcp` to a running server; the overview uses its in-memory client to list the tools. It is pinned to the same exact version everywhere it is declared, so all of them share one copy.
- [[npm:ws]] is only a test dependency: the server's tests open real WebSocket connections with it.

## Browser app

- [[npm:react]] and [[npm:react-dom]] render the toolbar, panels, designer and dialogs.
- [[npm:konva]] draws the table and the designer canvas on an HTML canvas, with hit testing, drag and drop and transforms for hundreds of pieces. [[npm:react-konva]] lets React components describe that canvas.
- [[npm:zustand]] holds the app's state in small stores (the table, the designer) without providers or boilerplate. What it holds is a copy of what the server sent, plus view state such as zoom and selection.
- [[npm:vite]] builds the app and serves it with hot reload in `pnpm dev`; [[npm:@vitejs/plugin-react]] adds JSX and fast refresh.
- No component library. The interface is drawn with Trayful's own design tokens (`packages/app/src/tokens.css`) and a small set of shared components ([[app/ui/Menu.tsx]], [[app/ui/Card.tsx]] and the files beside them), so it looks like Trayful and adds no runtime dependency. A few Lucide icons and the Red Hat Display typeface are copied into the source; `THIRD_PARTY_NOTICES.md` holds their licences. The views move to the tokens one at a time; the Tray was first.

## Command line

- [[npm:open]] opens the table in the person's browser after `trayful play`.
- `cloudflared`, when installed, gives `trayful play --tunnel` a public address. It is a program on the person's computer, not an npm dependency.

## Tests

- [[npm:vitest]] runs the unit tests of every package from one config, `vitest.config.ts`, which also holds each package's coverage floor; [[npm:@vitest/coverage-v8]] measures coverage.
- [[npm:@playwright/test]] drives a real Chromium against a real server in `e2e/`: playing, snapping, two players, agents, authoring and printing. Pinned to an exact version because the browser build must match it.

## Code quality

- [[npm:eslint]] with [[npm:@eslint/js]], [[npm:typescript-eslint]] (type-aware rules) and [[npm:eslint-plugin-sonarjs]] enforce the complexity and size limits and catch common smells. sonarjs is pinned exactly, so a new release cannot add findings that fail the build without someone choosing to update it.
- [[npm:prettier]] formats everything; `pnpm lint` checks it.
- [[npm:dependency-cruiser]] enforces the package layers and folder order (`.dependency-cruiser.cjs`); the overview also uses it to find every module and its imports.
- [[npm:knip]] finds unused files, exports and dependencies. [[npm:jscpd]] finds copy-pasted code.

## Packaging and docs

- [[npm:esbuild]] bundles the CLI, server, core and formats into the single file of the `trayful` npm package (`scripts/package.ts`), and the engine client into `trayful/engine`. It is used only there.
- [[npm:marked]] turns the Markdown pages in `architecture/` into this site.

## What is deliberately not here

- **No database or ORM.** Project folders and `tables/*.json` are the storage; see [[concept:decisions]].
- **No CSS framework or component library.** The app has one stylesheet, `packages/app/src/styles.css`, and draws the table itself.
- **No server framework beyond Fastify, and no auth provider.** Access is the host on this computer and guests with invite links.
- **No bundler for the server in development.** esbuild runs only when the npm package is built.

Next: [[concept:decisions\|the decisions behind the shape]].
