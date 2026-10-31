# Changelog

What changed in each version of the `trayful` npm package. The Release workflow uses the section for a version as the notes of its GitHub release.

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
