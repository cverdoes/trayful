# Trayful

Trayful is a boardgame prototyping table. You describe your components (cards, boards, tokens, meeples, dice, counters) in plain YAML files, and Trayful lays them out on a table where people and AI agents can drag, flip, rotate, stack and shuffle them.

> **Status: Milestone 1 (first playable table).** You can open a prototype on a table in your browser and play it: drag, flip, rotate, stack, draw, shuffle, roll and undo, with every change saved to disk. Snapping arrives in Milestone 2 and MCP support in Milestone 3. See the [roadmap](#roadmap).

## Quick start

You need [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/) 10. If you have Node but not pnpm, run `corepack enable` once.

```sh
git clone https://github.com/cverdoes/trayful.git
cd trayful
```

<!-- quickstart:start -->

```sh
pnpm install
pnpm build
pnpm trayful validate examples/harvest-moon
pnpm trayful play examples/harvest-moon
```

<!-- quickstart:end -->

`validate` should end with `✓ Harvest Moon: 6 types, 26 components, 1 deck, 1 setup`. `play` starts a local server at http://127.0.0.1:4317 and opens the table in your browser; press Ctrl+C to stop it. CI runs exactly the commands between the quick-start markers above on a clean checkout, so they stay correct.

## Playing on the table

Drag a piece to move it. Drag the top card off a pile to draw it, and drop cards on a pile to stack them; hold Shift to drag a whole pile. Double-click a card to flip it or a die to roll it. Click to select, Shift+click or Shift+drag on empty table to select several, then use the toolbar or the keys: **F** flip, **Q**/**E** rotate, **D** draw, **S** shuffle, **R** roll, **+**/**−** counters, **L** lock, **Ctrl+Z** undo. Drag empty table to pan, scroll to zoom, **0** to fit, **?** for all shortcuts.

The table is saved to `tables/table-1.json` inside the project folder as you play, and reopens where you left off. **New table** in the toolbar starts over from the project files (you can undo it).

| `trayful play` option | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `--table <name>`      | Open or create another saved table, e.g. `--table b` |
| `--seed <n>`          | Shuffle seed for a new table, for repeatable games   |
| `--port <n>`          | Use another port than 4317                           |
| `--no-open`           | Do not open a browser window                         |

## Make your own prototype

A prototype is a folder:

```
my-game/
  trayful.yaml            # project manifest: name and which files to load
  library/*.yaml          # component types: size, fields, how each side looks
  inventory.yaml          # what is in the box, and how many of each
  data/*.csv              # optional card data, one row per card
  setups/*.yaml           # optional scripted starting layouts
  assets/                 # images and SVGs
```

The easiest start is to copy the sample and edit it:

```sh
cp -r examples/harvest-moon ../my-game
pnpm trayful validate ../my-game
pnpm trayful play ../my-game
```

The validator points at the exact file, line and column of each problem. Every key is documented in the [format reference](docs/reference/README.md).

## Repository layout

| Path                                             | What it is                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`packages/formats`](packages/formats)           | File format schemas (Zod), YAML loader and validator, generated JSON Schemas                       |
| [`packages/core`](packages/core)                 | Table state, commands (move, flip, rotate, stack, draw, shuffle, roll), undo and seeded randomness |
| [`packages/server`](packages/server)             | Local server: one table per project, WebSocket sync, saves to `tables/`                            |
| [`packages/app`](packages/app)                   | Browser table (React and Konva)                                                                    |
| [`packages/cli`](packages/cli)                   | The `trayful` command line                                                                         |
| [`examples/harvest-moon`](examples/harvest-moon) | Sample prototype that uses every file kind; validated in CI                                        |
| [`docs`](docs)                                   | Format reference (generated) and, from Milestone 4, HOWTO guides                                   |
| [`e2e`](e2e)                                     | Browser tests (Playwright) that play a hand on the example                                         |
| [`scripts`](scripts)                             | Code generation, example validation and the dev server                                             |

## Development

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm dev`               | Table server plus the app with hot reload at http://localhost:5173       |
| `pnpm build`             | Build the browser app (needed before `trayful play`)                     |
| `pnpm test`              | Run all unit tests (Vitest)                                              |
| `pnpm test:e2e`          | Play a hand in a real browser (Playwright); run `pnpm build` first       |
| `pnpm test:watch`        | Re-run tests on change                                                   |
| `pnpm typecheck`         | Type-check every package                                                 |
| `pnpm lint`              | ESLint and Prettier check                                                |
| `pnpm format`            | Format everything with Prettier                                          |
| `pnpm generate`          | Regenerate JSON Schemas and the format reference after changing a schema |
| `pnpm validate:examples` | Validate every project in `examples/`                                    |
| `pnpm check`             | Everything CI runs, in one go                                            |

Packages are TypeScript run directly from source (through `tsx` and Vitest). Only the browser app is built, with Vite. `pnpm dev [project-dir]` serves the app with hot reload; it opens `examples/harvest-moon` unless you name another folder. Before `pnpm test:e2e` on a new machine, run `pnpm exec playwright install chromium` once.

When you change a schema in `packages/formats/src/schemas.ts`, run `pnpm generate` and commit the regenerated files; CI fails when they are stale. When you change setup steps, scripts or commands, update this README in the same change.

## Roadmap

| Milestone                          | Scope                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0. Foundations                     | Monorepo, file schemas, validator with line numbers, core engine with undo, JSON Schemas, generated reference |
| **1. First playable table** (this) | Browser table: drag, flip, rotate, stack, draw, shuffle, undo, save and load                                  |
| 2. Components and snapping         | Boards with snap grids, meeples, dice, counters, layouts                                                      |
| 3. MCP                             | Agents read and play tables over the Model Context Protocol                                                   |
| 4. Projects and authoring          | Several projects and tables, setups, live reload, CSV, print-and-play, HOWTO guides                           |
| 5. Multiplayer                     | Remote playtesters, hidden hands                                                                              |
