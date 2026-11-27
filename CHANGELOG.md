# Changelog

What changed in each version of the `trayful` npm package. The Release workflow uses the section for a version as the notes of its GitHub release.

## 0.4.0

Projects saved with 0.3.0 open unchanged in 0.4.0, and invite links keep working. What changes is how Trayful is started: it always serves a folder of projects, so `trayful play my-game` also lists the games beside `my-game`, and the first time it serves a folder that holds other files too, it asks before going on (see below).

### Always a folder of projects

- Trayful always serves a folder of projects. `trayful play my-game` still works: it serves the folder `my-game` is in and opens `my-game` first, so the table menu also lists the games beside it.
- **New project…** in the table menu (and the `create_project` MCP tool) starts a new game from the starter template, beside the others, however Trayful was started. On a git repository, it is committed and pushed like any other change.
- The players who joined are kept in `.trayful/` in the folder of projects, which leaves itself out of git. Started on a project folder that has `.trayful/players.json` from 0.3.0, Trayful moves the file there, so invite links keep working.
- The first time Trayful serves a folder that holds other files too, such as the home folder, it asks before going on. `--yes` answers for it; `trayful new` marks the folder it puts the project in, so playing it needs no answer.
- A project folder added to the folder of projects while Trayful runs shows up in the table menu.

### Host your own

- Owner mode, for a Trayful on a server of your own: `trayful play --owner` takes an owner secret from `TRAYFUL_OWNER_SECRET`. Whoever signs in with it is the host from anywhere, and agents such as claude.ai connectors reach MCP through OAuth, or with the secret as a bearer token. Without `--owner`, nothing changes.
- `--public-url` makes invite links under the server's own address.
- `compose.owner.yaml` runs Trayful with Caddy in front for HTTPS. See the new guide, `docs/howto/host-your-own.md`.

### Work on a git repository

- `trayful play --data <folder>` works on a git repository instead of a folder on the server: Trayful keeps a clone in `<folder>`, and commits, pulls and pushes. `--repo`, `--branch` and `--path` say which repository, branch and folder of projects (a project's own folder works too); without them Trayful starts with no project and waits for one. Only the project folders are checked out.
- New MCP tools: `connect_repository`, `sync_repository`, `repository_status` and `resolve_conflict`. A sync never leaves a half-merged file in the project: when both sides changed the same lines, Trayful's side goes to a `trayful/conflict-…` branch.
- Trayful syncs by itself: it commits 30 seconds after the files change, fetches every 2 minutes and pushes at most every 5. Commit messages say who changed what, such as `Trayful: upsert_type (agent); Tray (Claes)`. A push webhook (`/api/repository/hook`, signed with `TRAYFUL_GIT_WEBHOOK_SECRET`) makes it take in a push at once.
- In the browser, the host connects a repository on the first page, sees the branch and how it stands in the toolbar, syncs from there, and settles a conflict from a banner.
- Branches for experiments: `create_branch`, `switch_branch` and `list_branches`, or **New branch…** and **Switch branch…** in the toolbar. `snapshot_tables` (**Commit the tables**) commits and pushes the saved tables, which syncs leave out.
- The token for HTTPS repositories comes from `TRAYFUL_GIT_TOKEN` or `TRAYFUL_GIT_TOKEN_FILE`, and is never written to disk. `compose.git.yaml` runs it on a server. See the new guide, `docs/howto/git-backed.md`.

### Extensions

- `trayful/server` is a new entry point of the npm package, for extensions in code of your own: `startServer` takes `extensions`, which can decide who counts as the host (`access`), which folder of projects a request is for (`spaces`) and how far each may grow (`limits`). Owner mode is now one such extension. Its types come with it, and `packages/server/public-api.md` in the repository lists all it exports. The types it takes from Fastify and zod need those packages installed; the package lists them as optional peer dependencies, at the versions it bundles. While Trayful is at 0.x, a minor version may change it.

### Designer

- A rectangle or cube shape layer takes `corner` for rounded corners, shown as **Corner (mm)** on the Drawing page. **Radius** only shows for the shapes it applies to (circles, discs, hexes and triangles), and the selection outline, resizing and rotating no longer measure a rectangle by a radius it ignores.
- Changing a layer's shape, or setting or clearing its radius, keeps it where it was.

### Docs

- The user guide is in `docs/guide/`, which ships with the npm package so agents can read it, and the README is a short start. The documentation site at https://cverdoes.github.io/trayful/ has a landing page with the user guide, HOWTO guides and format reference on one side and the contributors' pages on the other.

### Docker

- Each release is also published as a Docker image, `ghcr.io/cverdoes/trayful`, for amd64 and arm64: `docker run --rm -it --init -p 127.0.0.1:4317:4317 ghcr.io/cverdoes/trayful` plays the examples, and `-v ~/games:/projects --user "$(id -u):$(id -g)"` plays your own. It has git and runs as a non-root user. See `docs/guide/docker.md`.
- `compose.owner.yaml` runs the published image (`TRAYFUL_IMAGE`, `latest` by default), so a server of your own needs only the compose files and a `.env` file, not a clone of the repository.
- The image now runs the same bundle as the npm package, so `trayful new` and **New project** work in a container, and `trayful --version` says which version it is.

## 0.3.0

Projects and tables saved with 0.2.0 open unchanged in 0.3.0. A table that uses the new surfaces does not open in 0.2.0 or older.

### Agents that run the game

- An agent can ask players things: the `prompt` MCP tool shows some players a message, a yes/no question or a choice above their hand, and `cancel_prompt` and `list_prompts` withdraw it and read the answers. Only the players asked see a prompt.
- Prompts can also ask a player to pick pieces (`pick`) or places (`place`) on the table, which glow gold, or to give a number or a short text. `anchor` shows a prompt as a bubble beside a piece or place and `highlight` makes other pieces glow. `to: 'everyone'`, `until: 'first'` and `expires` say who answers and for how long.
- A prompt never names a piece that one of its players can't see; face-down candidates show under a stand-in id. Open prompts are kept in `tables/<name>.prompts.json` beside the table, so a restart keeps them; the file goes away once none are open.
- `wait_for_events` follows the table: moves (in the words people see), undo and redo, answers, prompts closing, and players coming and going. `describe_table` now lists the players at the table and their ids.
- A new MCP prompt, `run-game` (`/trayful:run-game` in Claude Code), starts an agent off as referee or tutor.
- An engine, a program that runs a game from outside the table, knocks to join, and the host answers **Allow**, **Allow with full view** or **Deny**. Engines show as "(engine)" in the players list, and the host can send one away. See the new guide, `docs/howto/game-engine.md`.
- The package now ships a typed client for engines written in JavaScript or TypeScript: `import { knock, TableConnection } from 'trayful/engine'`. It needs only Node 22's built-in `fetch` and `WebSocket`.
- New example: `examples/referee`, a referee for Harvest Moon written with `trayful/engine`.

### Surfaces

- A table can have surfaces besides the Centre: separate play spaces with their own positions, such as one per player. Everyone sees every surface. Tables that never use them work as before.
- Commands and MCP tools: `move`, `draw`, `deal` and `take` take a `surface`, and `surface:<id>` as a target finds free room there; `add_surface`, `edit_surface`, `remove_surface` and `sit` manage them. `describe_table` and `query_objects` can look at one surface.
- In the browser, each surface is a tile with its own pan and zoom, the Centre the largest. Chips under the toolbar switch tiles on and off, a view menu picks all surfaces, yours and the Centre, or the Centre only, and a tile can be focused on its own (number keys, `Esc` to go back). Each viewer's choice is kept in their browser per table, and a hidden surface's chip pulses when someone else changes it.
- Pieces move between surfaces by dragging from tile to tile, by dropping them on a chip, or with "Send to…" on the toolbar. The chip row adds, renames and removes surfaces, makes them seats, and lets a player sit down or stand up.
- Setups can list surfaces under `surfaces`, and `place` and `deal` steps take a `surface`, or `surface:<id>` as a target. Start over keeps players in their seats.
- The `snapshot` MCP tool takes a `surface` to picture one surface.
- A surface can have a colour, a project colour name or a CSS colour, that tints its tile frame and chip. Set it in a setup, with `add_surface` or `edit_surface`, or from the chip's menu.
- A setup's `place` takes the start of components' ids up to a dot, so `worker.red` places every red worker.
- Harvest Moon has a `2-player-farms` setup with a coloured farm for each player.

### Following other players' moves

- When someone else, a person or an agent, moves a piece, it slides from where it was to where it lands instead of jumping there, a flipped piece turns over, and a card drawn from a pile slides out of it. Cards that come out of a hidden hand fade in where they land.
- Whatever someone else changed gets a ring in their colour for a couple of seconds.
- Agents are paced while people watch: each MCP tool that changes the table answers once its change has played out on their tables, so a quick run of agent moves shows one at a time. `trayful play --no-pace` (and `trayful mcp --no-pace`) answers straight away.
- Reduced motion keeps the rings but skips the sliding.

### On the table

- A piece dragged from one surface tile to another stays visible the whole way, at the zoom of the tile under the pointer, instead of being cut off at the tile's edge.
- Round pieces such as meeples, discs and hexes are shaded from light to dark so they read as solid pieces, and the felt has a fine grain and a soft vignette.
- Images on the table are drawn from copies painted at the size they are shown, so zooming, panning and dragging stay smooth with detailed SVG art. Zoomed in on a high-resolution screen, Harvest Moon redraws about four times faster.
- Harvest Moon is redrawn: a framed board with field plots, a barn and a score track, art on every card, a new card back, ivory dice and a gold coin counter, in Trayful's palette.

### Designer

- The Tray's editors are spreadsheets: a CSV file, one design and designs in rows are each one ruled grid with numbered rows and columns as wide as their text. The arrow keys, `Enter` and `Shift+Enter` move between cells. A field with choices is a drop-down in its cell, in a CSV file too. Buttons to remove a row or column show when it is hovered or focused.
- Cells copied from a spreadsheet paste across several cells of a CSV file, adding rows as needed.
- The Tray adds typed designs with one **Designs** button, in place of "One design" and "Designs in rows": an entry starts with one design and takes more rows. **Move to CSV** and **Move to inventory** change where an entry keeps its designs.
- A component's kind is shown in Basics and changed with **Change…**, which opens a dialog describing the five kinds, in place of a row of five buttons. Labels and layers are added with **+ Add label** and a **+ Add layer** menu, and each drop area has a × to remove it.
- Every colour control is one button showing the colour, which opens a small picker with the project's colours, none and transparent, the component's fields as `{{field}}`, and a box for any other value. Colour cells in the Tray use it too.
- Labels, drawing and drop areas each have their own page in the inspector, opened from a row on the main page that counts them and names them. **‹ Back** or `Esc` returns to the main page; clicking a label, a layer or a drop area on the canvas opens its page. The label editor is shorter, with related settings sharing a row.

### A new look

The whole app is drawn in Trayful's own colours, typeface and icons; the grey look is gone.

- The Tray has a designed layout in Trayful's own colours and typeface. Its header names the component and how many are in the box, with undo, redo and the save status beside one **Add** menu. Each entry is a card that says what it makes, with **Deck** and **Copies of each** as labelled fields and a **⋯** menu that holds **Move to CSV**, **Move to inventory** and **Remove**. An empty Tray says what to do.
- The whole designer is in the same colours and typeface. The Components page has a header above the canvas with the component's name and file, the sample design, the save status, and undo and redo as icon buttons. The inspector's sections, the layer list and the mode tabs use the same icons and controls as the Tray.
- The Assets page has the same header as the other designer pages, with **Add images** as its main action; pictures can be dropped anywhere on the page. Each image is a card with its rows and columns as fields and **Rename** and **Remove** in a **⋯** menu. Colours are rows with the colour's value beside its name.
- Questions are asked in Trayful's own dialogs in place of the browser's boxes: renaming a component, an image or a surface, naming a new table or surface, and confirming a delete, a removal or starting a table over. A dialog that removes something starts with the focus on **Cancel**. **New component**, **Add a drop area**, **Invite players** and the help share the same dialog, which holds the focus while it is open and closes on `Esc`, its cross or a click outside.
- The table's toolbar and surface chips are in Trayful's colours and typeface. Undo, redo, fit, help and **More** are icon buttons; the actions on the selected pieces have icons, with rotating and the counter's − and + as icons alone. **More**, **Send to** and each chip's menu are the same menus as in the designer, and the connection shows as a coloured dot.
- Everything over the table is in the same colours: the hand and its bubble, prompts and their buttons, the stamp and group pickers, the names on surface tiles, and the join and closed screens. What another player or an agent did, an error, and errors in the project files show as notices with an icon and a coloured stripe.
- In the component list, the number in the box is a badge, **New component** is at the top, and **Duplicate** and **Delete** are in a **⋯** menu on the selected component.
- The print-and-play page has the same header as the designer pages, with **Print** as its main action.
- An invite link that no longer works opens a page in Trayful's look that says the link has expired, in place of a line of plain text.

### Fixes

- In the Tray, an edit in one field followed quickly by an edit in another field no longer undoes as one step. Only typing in the same field joins into one step.

## 0.2.0

Projects and tables saved with 0.1.0 open unchanged in 0.2.0; everything new is added on top.

### Roll-and-write games

- A new component kind, `is: stamp`, is a face you mark a sheet with. It never moves, flips or stacks and is never in the inventory.
- Two new spot modes on drop areas make score-sheet boxes: `stamp` boxes take one of the stamps they accept, `text` boxes hold written text. Click a box to mark it, right-click to erase. Marks are saved on the sheet, move with it and stay hidden when it is face down.
- Agents get `mark` and `erase` MCP tools and see marks in `describe_table`. The designer offers Stamp as a kind and stamp and text boxes as drop areas.
- New example: `examples/roll-and-write` (Six Rows).

### On the table

- Hold **Space** over a piece to see it large in the middle of the screen, from your own view, so nothing hidden shows. A board shows with everything on it. A quick tap keeps it open until Space, Esc or a click.
- Shortcut keys act on the piece under the pointer, which lights up, unless something is selected. Locked pieces never light up.
- Dice tumble when rolled, and piles riffle when shuffled. Reduced-motion settings skip both.
- Rows (`mode: row`) run on past their right end instead of overlapping, centre what they hold, and grow with it, so a drop anywhere along a row joins it. They also take a piece dropped half over them.
- Cards drawn from a stack or played from a hand into a drop area join it straight away; a card dropped onto a card in a row is inserted there.
- The hand along the bottom can be resized by dragging its top edge, and **H** shrinks it to a bubble in the lower left that still takes drops.
- A tidier toolbar: actions for the selection show only when they apply, and Design, Print, Invite and Start over moved to a More menu.
- The app has the new Trayful logo, a favicon and home-screen icons.

### Designer

- Panel sections fold, and drop areas are added from an "Add drop area" dialog.

### Agents

- `trayful skill [repo-dir]` adds a Claude Code skill for Trayful to a repository, in `.claude/skills/trayful`, so an agent working on a game in its own repository knows how to drive Trayful over MCP. See the new guide, `docs/howto/game-repository.md`.

### Fixes

- A saved table now picks up pieces added to the project's Tray while the server was stopped, when it is opened again.
- Zooming in on a busy table is much faster: piece shadows are cheaper to draw.

### Security

- body-parser is updated to 2.4.0 for advisory GHSA-27r3-jxmh-p828.

## 0.1.0

The first release on npm.
