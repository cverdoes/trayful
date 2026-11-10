# Changelog

What changed in each version of the `trayful` npm package. The Release workflow uses the section for a version as the notes of its GitHub release.

## Unreleased

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
- A table that uses surfaces does not open in older versions.

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
