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

- **`place`** puts something somewhere. Name a type (`worker` places every worker, side by side), one component by id (`score-marker.red`) or a deck (`{ deck: actions }`). Add `face`, `rot`, or for a deck `shuffle: true`.
- **`deal`** takes cards off the top of a deck. Dealing to a snap target such as `main-board/market` fills its free spots in order; dealing to a position makes a pile there.
- **`shuffle`** shuffles a deck, e.g. `- shuffle: actions`.

`at` and `to` are either an `[x, y]` position on the table in millimetres (the centre of what is placed; y grows downwards) or a snap target, as described in [Add a board with snap spots](board-with-snap-spots.md). Anything a setup does not place is laid out in rows below the table, so nothing in the box goes missing.

## Use it

Name the setup in `trayful.yaml` to start every new table from it:

<!-- example: examples/harvest-moon/trayful.yaml -->

```yaml
setup: 2-player
```

**Start over** in the table's toolbar sets the table up again from the files (you can undo it), and **New table** in the menu starts another table. From the command line, `pnpm trayful play my-game --table test --setup 2-player` starts a new table from a setup, and `--setup none` lays everything out in rows instead.

Setups shuffle with the table's seed, so `--seed 7` gives the same deal every time.
