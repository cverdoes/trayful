# Trayful

Trayful is a boardgame prototyping table. You describe your components (cards, boards, tokens, meeples, dice, counters) in plain YAML files, and Trayful lays them out on a table where people and AI agents can drag, flip, rotate, stack and shuffle them.

> **Status: Milestones 1 to 3.** You can open a prototype on a table in your browser and play it, with pieces that snap onto boards and a setup that lays out the game for you, and an AI agent such as Claude can play on the same table over MCP while you watch. Projects and authoring tools (Milestone 4) come next. See the [roadmap](#roadmap).

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

Drag a piece to move it. While you drag, the board spots it may go to light up, and dropping it near one snaps it in; pieces on a board move along with the board. Drag the top card off a pile to draw it, and drop cards on a pile to stack them; hold Shift to drag a whole pile. Double-click a card to flip it or a die to roll it. Click to select, Shift+click or Shift+drag on empty table to select several, then use the toolbar or the keys: **F** flip, **Q**/**E** rotate, **D** draw, **S** shuffle, **V** fan or spread a pile out (then drag out any card), **R** roll, **+**/**−** counters, **L** lock (boards start locked), **Ctrl+Z** undo. Drag empty table to pan, scroll to zoom, **0** to fit, **?** for all shortcuts.

A new table starts from the setup named in `trayful.yaml` (Harvest Moon's puts the board in the middle, deals the market and lines up the workers). The table is saved to `tables/table-1.json` inside the project folder as you play, and reopens where you left off. **New table** in the toolbar starts over from the project files (you can undo it).

| `trayful play` option | What it does                                         |
| --------------------- | ---------------------------------------------------- |
| `--table <name>`      | Open or create another saved table, e.g. `--table b` |
| `--seed <n>`          | Shuffle seed for a new table, for repeatable games   |
| `--setup <name>`      | Setup for a new table; `none` lays everything out    |
| `--port <n>`          | Use another port than 4317                           |
| `--no-open`           | Do not open a browser window                         |

## Let an agent play

Trayful is an [MCP](https://modelcontextprotocol.io) server, so agents such as Claude Code or Claude Desktop can read the table and play on it. Their moves show up live in your browser, with a note saying what they did, and share the undo history with you.

The simplest way: start the table, then point the agent at it over HTTP.

```sh
pnpm trayful play examples/harvest-moon
claude mcp add --transport http trayful http://127.0.0.1:4317/mcp   # in another terminal, once
```

Then ask Claude something like "shuffle the action deck, deal three cards to two players and play a round". It starts with `describe_table`, which lists every pile and piece with its position.

For clients that start MCP servers themselves (stdio), run `trayful mcp`. It joins the table that `trayful play` has open, or opens the table itself so you can watch at http://127.0.0.1:4317:

```sh
claude mcp add trayful -- node /path/to/trayful/packages/cli/bin/trayful.js mcp /path/to/trayful/examples/harvest-moon
```

In Claude Desktop the same goes in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trayful": {
      "command": "node",
      "args": ["/path/to/trayful/packages/cli/bin/trayful.js", "mcp", "/path/to/my-game"]
    }
  }
}
```

| Tools                                                                                                         | What they do                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `describe_table`, `query_objects`, `snapshot`                                                                 | Read the table as text or JSON, or as a PNG image |
| `move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `take`, `layout`, `shuffle`, `roll`, `set_counter`, `lock` | Play, the same moves people make                  |
| `undo`, `redo`, `get_history`, `reset_table`                                                                  | Shared history, and a fresh table                 |

Agents can aim moves at board spots by name, such as `main-board/fields/3`, or deal into a whole target such as `main-board/market`; `describe_table` lists every snap target and which spots are free. Face-down cards stay hidden from the agent unless it asks with `reveal: true`. `snapshot` needs the table open in a browser, since the browser draws the picture. Resources give the full table state, the project, each component type and the file format schemas.

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

Boards declare **snap targets** in their library type: a `grid` of spots (card slots, action spaces), a list of `points` (a score track) or a free `area` (a supply), each optionally limited to some types with `accepts`. A **setup** file places components on those targets and on the table, shuffles and deals; set `setup: <file name>` in `trayful.yaml` to start every new table from it. See [`library/pieces.yaml`](examples/harvest-moon/library/pieces.yaml) and [`setups/2-player.yaml`](examples/harvest-moon/setups/2-player.yaml) in the sample.

## Repository layout

| Path                                             | What it is                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| [`packages/formats`](packages/formats)           | File format schemas (Zod), YAML loader and validator, generated JSON Schemas |
| [`packages/core`](packages/core)                 | Table state, commands, snapping, setups, undo and seeded randomness          |
| [`packages/server`](packages/server)             | Local server: one table per project, WebSocket sync, MCP, saves to `tables/` |
| [`packages/app`](packages/app)                   | Browser table (React and Konva)                                              |
| [`packages/cli`](packages/cli)                   | The `trayful` command line                                                   |
| [`examples/harvest-moon`](examples/harvest-moon) | Sample prototype that uses every file kind; validated in CI                  |
| [`docs`](docs)                                   | Format reference (generated) and, from Milestone 4, HOWTO guides             |
| [`e2e`](e2e)                                     | Browser tests (Playwright) that play a hand on the example                   |
| [`scripts`](scripts)                             | Code generation, example validation and the dev server                       |

## Development

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm dev`               | Table server plus the app with hot reload at http://localhost:5173       |
| `pnpm build`             | Build the browser app (needed before `trayful play`)                     |
| `pnpm test`              | Run all unit tests (Vitest)                                              |
| `pnpm test:e2e`          | Play in a real browser, by hand and as an agent; run `pnpm build` first  |
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

| Milestone                             | Scope                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 0. Foundations                        | Monorepo, file schemas, validator with line numbers, core engine with undo, JSON Schemas, generated reference |
| 1. First playable table               | Browser table: drag, flip, rotate, stack, draw, shuffle, undo, save and load                                  |
| **2. Components and snapping** (this) | Boards with snap grids, meeples, dice, counters, setups, fanned and spread piles                              |
| 3. MCP                                | Agents read and play tables over the Model Context Protocol                                                   |
| 4. Projects and authoring             | Several projects and tables, live reload, CSV, authoring tools, print-and-play, HOWTO guides                  |
| 5. Multiplayer                        | Remote playtesters, hidden hands                                                                              |
