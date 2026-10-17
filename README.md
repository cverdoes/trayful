# Trayful

Trayful is a boardgame prototyping table. You describe your components (cards, boards, tokens, meeples, dice, counters) in plain YAML files, and Trayful lays them out on a table where people and AI agents can drag, flip, rotate, stack and shuffle them.

> **Status: Milestones 1 to 9.** You can start a prototype from a template, play it on a table in your browser with pieces that snap onto boards and a setup that lays out the game, and see every file you save show up on the table at once. Playtesters can join a table from their own computers through an invite link to that table, each with a private hand and their own undo. An AI agent such as Claude can play on the same table over MCP, and design components with you. You can design components in the browser, describing each one by what it is and what it can do, with artwork from tiled image sheets. You can print everything at real size to play on paper. See the [roadmap](#roadmap).

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

Drag a piece to move it. While you drag, the board spots it may go to light up, and dropping it near one snaps it in; pieces on a board move along with the board. Drag the top card off a pile to draw it, and drop cards on a pile to stack them; hold Shift to drag a whole pile. Pieces sharing a group spot, like markers on a score track, stay separate: click one to list them all and pick the one you want. Double-click a card to flip it or a die to roll it. Click to select, Shift+click or Shift+drag on empty table to select several, then use the toolbar or the keys: **F** flip, **Q**/**E** rotate, **D** draw, **S** shuffle, **V** fan or spread a pile out (then drag out any card), **R** roll, **+**/**−** counters, **L** lock or unlock (setups can lock a board in place), **Ctrl+Z** undo. Drag empty table to pan, scroll to zoom, **0** to fit, **?** for all shortcuts.

A new table starts from the setup named in `trayful.yaml` (Harvest Moon's puts the board in the middle, deals the market and lines up the workers). The table is saved to `tables/table-1.json` inside the project folder as you play, and reopens where you left off. **Start over** in the toolbar sets the table up again from the project files (you can undo it). The menu next to the game's name switches tables: make a **new table** for another playtest, **duplicate** one to try two moves from the same position, or delete one. **Print** opens [print-and-play](docs/howto/print-and-play.md) sheets with every component at real size.

| `trayful play` option | What it does                                                      |
| --------------------- | ----------------------------------------------------------------- |
| `--project <id>`      | In a folder of projects, the one to open first                    |
| `--table <name>`      | Open or create another saved table, e.g. `--table b`              |
| `--seed <n>`          | Shuffle seed for a new table, for repeatable games                |
| `--setup <name>`      | Setup for a new table; `none` lays everything out                 |
| `--port <n>`          | Use another port than 4317                                        |
| `--no-open`           | Do not open a browser window                                      |
| `--share`             | Let others on your network join, by invite link                   |
| `--tunnel`            | Let others anywhere join, through a Cloudflare tunnel             |
| `--container`         | Run inside a container; see [Run it in Docker](#run-it-in-docker) |

## Play with others

Start the table with `--share` (same network) or `--tunnel` (anywhere; needs [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), no account), and Trayful prints an invite link to send your playtesters. They open it, pick a name, and play on that table, and no other; **Invite** in the toolbar makes links to any of your tables. Everyone undoes only their own moves.

```sh
pnpm trayful play examples/harvest-moon --share
```

Everyone has a private **hand** along the bottom of the screen: drag cards onto it to keep them hidden, and drag them out to play them (hold Alt for face down). The others see only how many cards you hold, and face-down cards stay hidden from every browser, down to the data it is sent. Only the host can make or delete tables, print, invite and connect agents. See [Play with others](docs/howto/play-with-others.md) and [Players and hands](docs/reference/players-and-hands.md).

## Let an agent play

Trayful is an [MCP](https://modelcontextprotocol.io) server, so agents such as Claude Code or Claude Desktop can read the table and play on it. Their moves show up live in your browser, with a note saying what they did. They undo only their own moves, and you only yours.

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
| `undo`, `redo`, `get_history`, `reset_table`                                                                  | Its own undo, the history, and a fresh table      |

Agents can aim moves at board spots by name, such as `main-board/fields/3`, or deal into a whole drop area such as `main-board/market`; `describe_table` lists every drop area and which spots are free. Face-down cards stay hidden from the agent unless it asks with `reveal: true`. The agent plays as **Claude**, with its own hand (`hand:claude`); it can deal into anyone's hand with `hand:<player>`, but never sees other players' hands. MCP is only offered on your own computer, never to guests. `snapshot` needs the table open in a browser, since the browser draws the picture. Resources give the full table state, the project, each component, the file format schemas and these docs (`trayful://docs`).

Agents can also build your prototype with you: ask Claude for "an event card with a title, a rule text and a season band, and a deck of six events", and it writes the component into your library, puts the cards in the box and looks at a picture of the result, while the new deck appears on your table. Every change is checked first, so an agent cannot leave your project broken. See [Let an agent build components](docs/howto/agent-builds-components.md).

| Projects and authoring tools                                              | What they do                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `list_projects`, `open_table`, `duplicate_table`, `delete_table`          | Find projects and tables, and switch the table the agent plays on |
| `create_project`, `validate_project`                                      | Start a project from the starter template; check one after edits  |
| `migrate_project`                                                         | Rewrite a `trayful/1` project in the current file format          |
| `upsert_type`, `rename_type`, `remove_type`, `set_inventory`, `add_asset` | Change components, what is in the box, and artwork                |
| `render_component`                                                        | A picture of one component, as people will see it                 |

## Run it in Docker

To keep the server apart from the rest of your computer, run it in a container. It then sees only the folder you give it, runs as an ordinary user on a read-only system, and can be reached only from your own computer. You need [Docker](https://docs.docker.com/get-docker/); Node and pnpm are not needed.

```sh
scripts/docker.sh            # serves examples/
scripts/docker.sh ~/games    # serves your own project, or folder of projects
```

Then open http://localhost:4317. The script builds the image, starts the container, and saves tables as you, so the files stay yours. It runs `docker compose up --build` with the settings below, which you can also set yourself:

| Setting            | What it does                                                        |
| ------------------ | ------------------------------------------------------------------- |
| `TRAYFUL_PROJECTS` | The folder to serve (default `./examples`); the only one it can see |
| `TRAYFUL_USER`     | The `uid:gid` to save files as (default `1000:1000`)                |
| `TRAYFUL_PORT`     | The port on your computer (default 4317); open the table there      |

You are the host, as with `trayful play`: inside a container the server counts requests through the published port as yours, so [`compose.yaml`](compose.yaml) publishes it on `127.0.0.1` only. Do not publish it on your network. `--share` does not work in a container. Agents connect over HTTP at `http://127.0.0.1:4317/mcp` as described above; `trayful mcp` on your computer cannot reach the container's table. Edits to the project files reload as usual. Stop it with Ctrl+C, or `docker compose down`.

## Make your own prototype

A prototype is a folder:

```
my-game/
  trayful.yaml            # project manifest: name and which files to load
  assets.yaml             # named images (whole or cut into tiles) and colours
  library/*.yaml          # components: size, what each is and can do, fields, its face
  inventory.yaml          # what is in the box, and how many of each
  data/*.csv              # optional card data, one row per card
  setups/*.yaml           # optional scripted starting layouts
  assets/                 # images and SVGs
```

Start one from the template, which has a deck of cards loaded from a spreadsheet, some tokens and a setup:

```sh
pnpm trayful new ../my-game --name "My Game"
pnpm trayful play ../my-game
```

To build components without writing YAML, click **Design** in the toolbar: the [designer](docs/howto/design-components.md) switches behaviours on and off and lays out fields and faces with a live preview, lets you drag labels, layers and board drop areas into place, drop in pictures and rename components everywhere they are used, and saves each change to your library files, keeping your comments.

Keep the table open while you edit: every time you save a file, the table updates (new cards appear, changed text redraws, and the change is one step you can undo). If a file has a mistake, a bar on the table names the file, line and column, and the table keeps the last version that worked. `pnpm trayful validate ../my-game` checks a project from the command line.

To keep several games together, put their folders in one folder and run `pnpm trayful play` on that folder; the table menu switches between them.

The [HOWTO guides](docs/howto/README.md) walk through adding a deck, designing components in the browser, loading cards from a spreadsheet, boards with drop areas, meeples and dice, your own images and tiled sheets, setups, designing with an agent and printing. Every key is documented in the [format reference](docs/reference/README.md).

A component describes what it `is` (a `piece`, `zone`, `die` or `counter`) and switches on what it can do: `flippable`, `rotates`, `stackable`, or `values` for dice and counters. A board is a piece that is a `container`: it declares **drop areas**, a `grid` of spots (card slots, action spaces), a list of `points` (a score track) or a free `area` (a supply), each optionally limited to some components with `accepts`. A **setup** file places components on those drop areas and on the table, locks the board, shuffles and deals; set `setup: <file name>` in `trayful.yaml` to start every new table from it. See [`library/pieces.yaml`](examples/harvest-moon/library/pieces.yaml) and [`setups/2-player.yaml`](examples/harvest-moon/setups/2-player.yaml) in the sample.

### Projects from an earlier Trayful

Projects made before milestone 9 are in the file format `trayful/1`. They still load and play, with a warning, but the designer and agents can only change their components once they are rewritten in `trayful/2`:

```sh
pnpm trayful migrate ../my-game
```

`migrate` rewrites the libraries in the new form, keeping the comment lines at their top; moves images and palette colours to a new `assets.yaml`; renames each inventory entry's `type` to `component`; and adds `lock: true` to the setup steps that place a board, since boards no longer start locked. The manifest, inventory and setups keep their comments. Commit the folder first if you want the old files. See [Versioning](docs/reference/versioning.md#moving-a-project-to-trayful2).

## Command line

| Command                                   | What it does                                                   |
| ----------------------------------------- | -------------------------------------------------------------- |
| `trayful new <folder> [--name <name>]`    | A new project from the starter template                        |
| `trayful play [project-dir]`              | Open the table in your browser; options above                  |
| `trayful mcp [project-dir]`               | MCP server on stdio, for agents                                |
| `trayful validate <project-dir> [--json]` | Check a project and report problems with file, line and column |
| `trayful migrate <project-dir>`           | Rewrite a `trayful/1` project in the current file format       |

From the repo root, run them as `pnpm trayful …`. See the [CLI README](packages/cli/README.md) for every option.

## Repository layout

| Path                                                       | What it is                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`packages/formats`](packages/formats)                     | File format schemas (Zod), YAML loader and validator, generated JSON Schemas                                      |
| [`packages/core`](packages/core)                           | Table state, commands, snapping, setups, undo and seeded randomness                                               |
| [`packages/server`](packages/server)                       | Local server: projects and tables, players and invites, live reload, WebSocket sync, MCP                          |
| [`packages/app`](packages/app)                             | Browser table (React and Konva)                                                                                   |
| [`packages/cli`](packages/cli)                             | The `trayful` command line                                                                                        |
| [`examples/harvest-moon`](examples/harvest-moon)           | Sample prototype that uses every file kind; validated in CI                                                       |
| [`examples/starter`](examples/starter)                     | The template `trayful new` copies; validated in CI                                                                |
| [`examples/piecepack`](examples/piecepack)                 | The public-domain piecepack with Backgammon and Tablut, built to find what Trayful cannot do yet; validated in CI |
| [`docs`](docs)                                             | HOWTO guides and the format reference (partly generated)                                                          |
| [`e2e`](e2e)                                               | Browser tests (Playwright): playing, snapping, agents, authoring, printing, two players                           |
| [`scripts`](scripts)                                       | Code generation, example validation and the dev server                                                            |
| [`Dockerfile`](Dockerfile), [`compose.yaml`](compose.yaml) | Running the server in a container; `scripts/docker.sh` starts it                                                  |

## Development

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm dev`               | Table server plus the app with hot reload at http://localhost:5173       |
| `pnpm build`             | Build the browser app (needed before `trayful play`)                     |
| `pnpm package`           | Build the `trayful` npm package in `packages/cli/dist`                   |
| `pnpm test`              | Run all unit tests (Vitest)                                              |
| `pnpm test:e2e`          | Play in a real browser, by hand and as an agent; run `pnpm build` first  |
| `pnpm test:watch`        | Re-run tests on change                                                   |
| `pnpm test:coverage`     | Unit tests with a coverage report in `coverage/`; fails below the floor  |
| `pnpm typecheck`         | Type-check every package                                                 |
| `pnpm lint`              | ESLint (incl. complexity and size limits) and Prettier check             |
| `pnpm quality`           | Package boundaries, unused code and copy-paste duplication               |
| `pnpm quality:summary`   | Coverage, complexity and duplication as Markdown                         |
| `pnpm format`            | Format everything with Prettier                                          |
| `pnpm generate`          | Regenerate JSON Schemas and the format reference after changing a schema |
| `pnpm validate:examples` | Validate every project in `examples/`                                    |
| `pnpm check`             | Everything CI runs, in one go                                            |

Packages are TypeScript run directly from source (through `tsx` and Vitest). Only the browser app is built, with Vite. `pnpm dev [project-dir]` serves the app with hot reload; it opens `examples/harvest-moon` unless you name another folder. Before `pnpm test:e2e` on a new machine, run `pnpm exec playwright install chromium` once.

When you change a schema in `packages/formats/src/schemas.ts`, run `pnpm generate` and commit the regenerated files; CI fails when they are stale. When you change setup steps, scripts or commands, update this README in the same change. When you change what a HOWTO guide describes, update the guide; `scripts/docs.test.ts` checks that the files the guides quote still match `examples/`, and that their links work.

### Code quality

CI enforces limits a person would otherwise have to police in review. ESLint checks complexity (cognitive complexity 15, nesting depth 4, at most 4 parameters, functions up to 80 lines, files up to 400) and common code smells. `.dependency-cruiser.cjs` keeps packages layered (formats, then core, then server and app, then cli) and core and the app free of Node built-ins. Knip finds unused files, exports and dependencies, and jscpd finds copy-pasted code. Unit test coverage must not drop below each package's floor in `vitest.config.ts`; the app's components are covered by the e2e suite instead.

Every file meets these limits, so a violation fails the build; fix the code rather than switching a rule off. When your tests raise a package's coverage, `pnpm test:coverage` raises its floor in `vitest.config.ts` to 2 points under the new number; commit that change with your tests.

Each CI run's summary page shows coverage per package, the most complex functions and duplication, and the HTML coverage report is attached to the run as `coverage-report`.

Claude sessions also review their own changes against [REVIEW.md](REVIEW.md) for readability, naming and design, locally, before opening a pull request. There is no review on the pull request itself.

### Dependencies

Dependabot opens weekly pull requests for npm packages, GitHub Actions and the Docker base image (`.github/dependabot.yml`). The Audit workflow runs `pnpm audit` on every push and pull request and each Monday, and fails on any high or critical advisory; fix it by updating or replacing the package, not by ignoring the advisory.

## Roadmap

| Milestone                            | Scope                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 0. Foundations                       | Monorepo, file schemas, validator with line numbers, core engine with undo, JSON Schemas, generated reference         |
| 1. First playable table              | Browser table: drag, flip, rotate, stack, draw, shuffle, undo, save and load                                          |
| 2. Components and snapping           | Boards with snap grids, meeples, dice, counters, setups, fanned and spread piles                                      |
| 3. MCP                               | Agents read and play tables over the Model Context Protocol                                                           |
| 4. Projects and authoring            | Several projects and tables, live reload, CSV, authoring tools, print-and-play, HOWTO guides                          |
| 5. Multiplayer                       | Players, invite links over the network or a tunnel, private hands, per-player hidden views                            |
| 6. Invites and undo                  | Invite links to one table, made from the toolbar; each player undoes only their own moves                             |
| 7. Component designer                | Design mode: types, fields and faces in the browser with a live preview, saved with comments kept                     |
| 8. Hands on the canvas               | Drag, resize and rotate layers with snapping; board snap spot editor; image drop; renames everywhere; undo            |
| **9. Components by property** (this) | File format `trayful/2`: `is` plus behaviours, faces with labels, an assets file with tiled images, `trayful migrate` |

## Licence

Trayful is source-available under the [Functional Source License 1.1, MIT Future License](LICENSE.md) (FSL-1.1-MIT). You may use, copy, change and share it for any purpose, including designing games you sell, except offering it to others as a commercial product or service that competes with Trayful, such as a paid hosted version. Each release becomes MIT-licensed two years after it is published.

The games in `examples/` are covered by the same licence unless their own README says otherwise.
