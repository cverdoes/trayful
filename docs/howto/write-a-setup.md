# Write a setup

A setup lays out a new table for you: the board in the middle, the deck shuffled, a market dealt and the pieces ready. Setups live in `setups/`, one file each, and run in order on an empty table.

## An example

This is Harvest Moon's two-player setup, [`setups/2-player.yaml`](../../examples/harvest-moon/setups/2-player.yaml):

<!-- example: examples/harvest-moon/setups/2-player.yaml -->

```yaml
kind: setup
name: Two players
description: The board in the middle, five market cards face up and every worker ready below.
steps:
  - place: main-board
    at: [0, 0]
    lock: true
  - place: { deck: actions }
    at: [350, -130]
    shuffle: true
    face: down
  - deal: { from: actions, to: main-board/market, count: 5, face: up }
  - place: worker
    at: [-270, 240]
  - place: score-marker.red
    at: main-board/score-track/0
  - place: score-marker.green
    at: main-board/score-track/0
  - place: coins
    at: main-board/supply
  - place: d6
    at: main-board/supply
```

## The steps

- **`place`** puts something somewhere. Name a component from the library (`worker` places every worker in the box, side by side), one of them by id (`score-marker.red`), the start of their ids (`worker.red` places every red worker) or a deck (`{ deck: actions }`). Add `face`, `rot`, `lock: true` to fix it in place, or for a deck `shuffle: true`.
- **`deal`** takes cards off the top of a deck. Dealing to a drop area such as `main-board/market` fills its free spots in order; dealing to a position makes a pile there.
- **`shuffle`** shuffles a deck, e.g. `- shuffle: actions`.

`at` and `to` are either an `[x, y]` position on the table in millimetres (the centre of what is placed; y grows downwards) or a drop area, as described in [Add a board with drop areas](board-with-snap-spots.md). Anything a setup does not place is laid out in rows below the table, so nothing in the box goes missing.

Nothing is locked unless a step says so. Lock the board, as above, so that dragging across it pans the table instead of moving the board and everything on it; press **L** on the table to unlock it.

## Player areas

A setup can give the table [surfaces](../reference/surfaces.md) besides the Centre, such as one per player, and put things there. List them under `surfaces`, then give a step's position a `surface`, or use `surface:<id>` as its target for free room there:

```yaml
surfaces:
  - { id: red, name: Red player, seat: true, color: red }
  - { id: blue, name: Blue player, seat: true, color: '#3a6ea5' }
steps:
  - place: player-board.red
    at: [0, 0]
    surface: red
  - place: worker.red
    at: player-board.red/workers
  - deal: actions
    to: surface:blue
    count: 3
```

A `color`, from the project's colours or a CSS colour, tints the surface's tile frame and chip. A drop area already says where it is, so `surface` goes only with an `[x, y]` position. Harvest Moon's `2-player-farms` setup does this. Things the setup does not place are laid out below the Centre.

## Use it

Name the setup in `trayful.yaml` to start every new table from it:

<!-- example: examples/harvest-moon/trayful.yaml -->

```yaml
setup: 2-player
```

**Start over** in the table toolbar's **More** menu sets the table up again from the files (you can undo it), keeping players in the seats they sat at, and **New table** in the menu starts another table. From the command line, `pnpm trayful play my-game --table test --setup 2-player` starts a new table from a setup, and `--setup none` lays everything out in rows instead.

Setups shuffle with the table's seed, so `--seed 7` gives the same deal every time.
