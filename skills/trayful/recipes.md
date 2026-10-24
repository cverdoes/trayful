# Trayful recipes

Worked examples for common asks. Each shows the tool calls in order. Definitions are written here as YAML for reading; send them to the tools as JSON objects. Adjust sizes, names and counts to the game.

## A deck from a tiled image

> "Make a deck from `art/creatures.png`, a sheet of 4 × 3 cards."

1. Get the image into the project and name it, with its tiles:
   - If the project folder is in your workspace, copy the file to `<project>/assets/creatures.png`, add `creatures: { file: assets/creatures.png, rows: 3, cols: 4 }` under `images:` in `assets.yaml`, and run `validate_project`.
   - Otherwise, if the file is small, `add_asset` with `path: assets/creatures.png`, `base64`, `name: creatures`, `rows: 3`, `cols: 4`.
2. `upsert_type` with a card that shows one tile per card:

   ```yaml
   id: creature
   size: [63, 88]
   is: piece
   flippable: true
   stackable: true
   fields:
     name: string
   face:
     corner: 3
     image: { asset: creatures, tile: instance }
   ```

3. `set_inventory` for `creature`, one row per tile, numbered from 0, left to right and then down. Leave out tiles that are blank on the sheet. Rows may only use fields the type declares (`name` above), apart from `tile`, `count` and `id`.

   ```yaml
   - deck: creatures
     items:
       - { name: Fox, tile: 0 }
       - { name: Owl, tile: 1 }
       - { name: Hare, tile: 2 }
   ```

4. `render_component` with `data: { tile: 5 }` to check that the tiles are cut where the cards are. If the picture is shifted, the sheet has margins or gutters: crop it to the cards first, or ask the person for a sheet without them.

If the back is also an image, add it as its own asset and give the card `flippable: { back: { image: creature-back } }`.

## A score track

> "Create a score tracker from 0 to 20 for four players."

1. `add_asset` with an SVG of the track as `text`, `path: assets/score-track.svg`, `name: score-track`. Draw the 21 spaces with their numbers, in a `viewBox` in millimetres, such as `viewBox="0 0 330 30"` for spaces 15 mm apart, the first one centred at `[15, 15]`.
2. `upsert_type` for the markers first, with the colour as a field. The track's `accepts` names them, and naming a type that does not exist yet is refused.

   ```yaml
   id: score-marker
   size: 10
   is: piece
   fields:
     color: { enum: [red, blue, green, yellow] }
   face:
     shape: disc
     fill: '{{color}}'
   ```

3. `upsert_type` for the track, with one drop spot per space in `group` mode, so several markers can share a space and each can still be picked up:

   ```yaml
   id: score-track
   name: Score track
   size: [330, 30]
   is: piece
   face:
     image: score-track
   container:
     - id: spaces
       accepts: [score-marker]
       mode: group
       grid: { origin: [15, 15], cols: 21, rows: 1, cell: 15 }
   ```

   For a track that bends round a board, use `points:` with the centre of each space in order instead of `grid`.

4. `set_inventory` for `score-track` with `[{}]`, and for `score-marker` with `[{ each: { color: [red, blue, green, yellow] } }]`.
5. On the table, `move` the markers to `score-track/spaces/0`, and later to `score-track/spaces/7`.

A single number per player is simpler as a counter: `{ id: score, size: [30, 20], is: counter, values: { range: [0, 99] } }`, changed with `set_counter`.

## A board with drop areas

> "Add a board with a market of five card slots and a supply area."

```yaml
id: main-board
size: [600, 400]
is: piece
face:
  image: board
container:
  - id: market
    accepts: [action-card]
    grid: { origin: [85, 70], cols: 5, rows: 1, cell: [70, 95] }
  - id: supply
    area: { at: [440, 180], size: 140 }
```

- `grid` spots are numbered from 0, left to right and then down. `origin` is the centre of the first spot and `cell` the distance between centres.
- `area` takes its top-left corner and size; things dropped there stay where they land. Add `mode: row` for a row of cards, or `mode: bag` for a draw bag.
- All drop area coordinates are from the board's top-left corner.
- `deal` with `to: main-board/market` fills the free slots in order.

To keep it from being dragged by accident, lock it in the setup that places it (`- place: main-board`, `at: [0, 0]`, `lock: true`) or with the `lock` tool.

## A deck from a spreadsheet

> "Load the event cards from `data/events.csv`."

1. `add_asset` with `path: data/events.csv` and the CSV as `text`, or copy the file into the project folder. The header row names the fields, and a `count` column gives copies. Every row needs every column, even if empty.
2. `upsert_type` with labels for the fields:

   ```yaml
   id: event-card
   size: [63, 88]
   is: piece
   flippable: true
   stackable: true
   face:
     fill: '#fffaf0'
     labels:
       - { field: title, at: [5, 5], width: 53, font: { size: 12, weight: bold } }
       - { field: text, at: [5, 30], width: 53, font: { size: 9 } }
   ```

3. `set_inventory` with `[{ deck: events, from: data/events.csv }]`.
4. `render_component` with the longest title and text in `data`, to check nothing overflows.

## Playing a round

> "Shuffle the deck, deal three cards to each of us and play a round."

1. `describe_table` to find the deck's id (such as `deck:actions`), the players and free spots.
2. `shuffle` with `id: deck:actions`, then `deal` with `from: deck:actions`, `to: [hand:claude, hand:<player>]`, `count: 3`. A player's id is their name in lowercase with dashes, such as `hand:sam`; if Trayful says there is no such player, ask the person what name they joined with.
3. Take turns by the rules, using `describe_table` or `query_objects` with `inside: hand:claude` to see your cards, and `get_history` to see what the others did.
