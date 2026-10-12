# Trayful

Trayful is a boardgame prototyping table. You describe your components (cards, boards, tokens, meeples, dice, counters) in plain YAML files, and Trayful lays them out on a table where people and AI agents can drag, flip, rotate, stack and shuffle them.

> **Status: Milestone 0 (foundations).** The file formats, validator and core table engine work today; the visual table arrives in Milestone 1 and MCP support in Milestone 3. See the [roadmap](#roadmap).

## Quick start

You need [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/) 10. If you have Node but not pnpm, run `corepack enable` once.

```sh
git clone https://github.com/cverdoes/trayful.git
cd trayful
```

<!-- quickstart:start -->

```sh
pnpm install
pnpm trayful validate examples/harvest-moon
pnpm test
```

<!-- quickstart:end -->

The validate command should end with `✓ Harvest Moon: 6 types, 26 components, 1 deck, 1 setup`. CI runs exactly the commands between the quick-start markers above on a clean checkout, so they stay correct.

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
```

The validator points at the exact file, line and column of each problem. Every key is documented in the [format reference](docs/reference/README.md).

## Repository layout

| Path                                             | What it is                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [`packages/formats`](packages/formats)           | File format schemas (Zod), YAML loader and validator, generated JSON Schemas                       |
| [`packages/core`](packages/core)                 | Table state, commands (move, flip, rotate, stack, draw, shuffle, roll), undo and seeded randomness |
| [`packages/cli`](packages/cli)                   | The `trayful` command line                                                                         |
| [`examples/harvest-moon`](examples/harvest-moon) | Sample prototype that uses every file kind; validated in CI                                        |
| [`docs`](docs)                                   | Format reference (generated) and, from Milestone 4, HOWTO guides                                   |
| [`scripts`](scripts)                             | Code generation and example validation                                                             |

## Development

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm test`              | Run all unit tests (Vitest)                                              |
| `pnpm test:watch`        | Re-run tests on change                                                   |
| `pnpm typecheck`         | Type-check every package                                                 |
| `pnpm lint`              | ESLint and Prettier check                                                |
| `pnpm format`            | Format everything with Prettier                                          |
| `pnpm generate`          | Regenerate JSON Schemas and the format reference after changing a schema |
| `pnpm validate:examples` | Validate every project in `examples/`                                    |
| `pnpm check`             | Everything CI runs, in one go                                            |

Packages are TypeScript run directly from source (through `tsx` and Vitest), so there is no build step yet.

When you change a schema in `packages/formats/src/schemas.ts`, run `pnpm generate` and commit the regenerated files; CI fails when they are stale. When you change setup steps, scripts or commands, update this README in the same change.

## Roadmap

| Milestone                  | Scope                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **0. Foundations** (this)  | Monorepo, file schemas, validator with line numbers, core engine with undo, JSON Schemas, generated reference |
| 1. First playable table    | Browser table: drag, flip, rotate, stack, draw, shuffle, undo, save and load                                  |
| 2. Components and snapping | Boards with snap grids, meeples, dice, counters, layouts                                                      |
| 3. MCP                     | Agents read and play tables over the Model Context Protocol                                                   |
| 4. Projects and authoring  | Several projects and tables, setups, live reload, CSV, print-and-play, HOWTO guides                           |
| 5. Multiplayer             | Remote playtesters, hidden hands                                                                              |
