# Snapping

A component with a `container` list is a **container**: other components dropped on it snap into its **drop areas** and from then on belong to it (see the [library reference](library.md#snaptarget)). Boards are the usual containers, but any piece or zone can be one, such as a player mat or a discard zone. Dice and counters cannot.

Every drop area has an `id` and exactly one of:

| Kind     | Declares                                                              | Spots                                                       |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `grid`   | `origin` (centre of the first spot), `cols`, `rows`, `cell` (spacing) | Numbered from 0, left to right, then top to bottom          |
| `points` | A list of spot centres                                                | Numbered from 0 in list order                               |
| `area`   | `at` (top-left corner) and `size`                                     | One area; what happens inside it is its `mode`, below       |

All positions are in the container's own coordinates: millimetres from its top-left corner.

## Modes

`mode` says what a drop area does with what lands in it. Spots (`grid` and `points`) and areas have their own modes; the first of each is the default.

| Mode     | For   | What it holds                                                                                                                                  |
| -------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `single` | spots | One thing per spot. Dropping on a taken spot puts the piece there anyway, on top.                                                              |
| `pile`   | spots | A stack on each spot: whatever lands there is stacked onto what is already there, so only stackable components that may share a stack can go. Only the top is in reach. |
| `group`  | spots | A group on each spot: everything stays a separate piece, spread a little around the spot, like score markers sharing a space. Any one can be picked up. |
| `stamp`  | spots | No pieces. Each spot is a box that can be marked with one of the stamps it accepts, like ticking a box on a score sheet. See [Stamps and text](#stamps-and-text). |
| `text`   | spots | No pieces. Each spot is a box that players write text in. See [Stamps and text](#stamps-and-text). |
| `free`   | areas | Things stay where they are dropped.                                                                                                            |
| `row`    | areas | A row from the left end, 2 mm apart, centred across the area and each turned like it. Dropping between two things puts it there; the rest close up when one leaves. A row has no end: when it is full, things carry on past its right end, so each stays in full view, and the area grows with them (plus room for one more), so a drop anywhere along the row joins it. |
| `bag`    | areas | A bag. What goes in is out of sight for everyone, agents too, and stacks come apart. Only the number of pieces inside is shown. Draw takes pieces out at random. |

A pile spot's stack follows the [stacking rules](library.md#componenttype): a piece that is not `stackable`, or not listed in `stackable.with` when it differs from what is already there, is refused.

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
container:
  - id: market
    accepts: [action-card]
    grid: { origin: [85, 70], cols: 5, rows: 1, cell: [70, 95] }
  - id: fields
    accepts: [worker]
    grid: { origin: [110, 200], cols: 4, rows: 2, cell: 50 }
  - id: supply
    area: { at: [440, 180], size: 140 }
```

## Names

A spot is named `owner/area/index` and a whole drop area `owner/area`. `owner` is the id of the container on the table, or its component id from the library when there is exactly one of it in the box. Harvest Moon has a single farm board, so both are `main-board`, and its spots are `main-board/fields/0` to `main-board/fields/7`.

## Accepts

`accepts` lists the component ids, and the representations (`piece`, `zone`, `die`, `counter`), that may snap to a drop area, such as `[action-card]` or `[worker, die]`. Without it, anything may. On a `stamp` drop area it lists the stamps that may be pressed there instead (without it, every stamp may), and a `text` drop area has none.

## Dropping by hand

While a piece is dragged, the spots that accept it light up. On drop:

1. If the drop point is inside an accepting area, the piece goes into that area: it stays where it was dropped, takes its place in a row, or goes into a bag. A row also takes a piece dropped up to half the piece's smaller side (at least 8 mm) outside it, since rows are often narrower than the cards in them.
2. Otherwise it snaps to the nearest accepting spot within reach: half the piece's smaller side, and at least 8 mm. Free spots win over taken ones within reach, and a pile or group spot is never taken.
3. Otherwise it stays on the table where it was dropped.

A snapped piece takes the spot's centre and the container's rotation. Several selected pieces dragged together only snap into areas.

## Riding along

Pieces in a drop area belong to its container: when the container moves or turns, they move and turn with it. This nests, so a token on a tile on a board moves with the board. Dragging a piece out of its spot frees it.

A container that should stay put, such as a board, is best locked with `lock: true` in the [setup](setup.md) step that places it. A locked container cannot be moved or turned, but pieces still snap into it and out of it.

## In setups and agent moves

`at` in a [setup](setup.md) and `to` in the `move`, `draw` and `deal` agent tools accept a spot name:

- A **spot** (`main-board/fields/3`) puts the piece there, even if the spot is taken.
- A **drop area** (`main-board/market`) as a deal target fills its spots in order, one card each; a setup deal fails if there are fewer spots than cards. Moving one piece to a drop area picks its first free spot.
- A **free area** (`main-board/supply`) places the pieces inside it: in the middle when that is clear, otherwise in the first room clear of what already lies there, scanning from the top-left. A group of pieces keeps its shape.
- A **row** takes the pieces at its right end, and a **bag** takes them out of sight.
- A **pile** or **group** spot takes every piece, so a deal to a drop area of them never runs out of spots.

## Groups

A group spot suits pieces that share a space but are moved one at a time, such as score markers on a track or armies in a region. Each piece keeps its own id, so an agent can move any of them straight off, and `describe_table` lists every one. The pieces are spread on a small grid around the spot and close up when one leaves.

On the table, clicking a piece in a group of two or more opens a list of the group's pieces; picking one selects it and brings it to the top, ready to drag.

## Bags

A bag's pieces are in no one's view; `describe_table` and every player see only how many there are. `draw` with `from` set to the bag's name (`sack/bag`) takes pieces out at random, using the table's seed, so a replay draws the same ones. On the table, clicking the count on a bag, or selecting the bag and pressing **D**, draws one into your hand.

`describe_table` lists every drop area with its free and taken spots, so an agent knows where things can go.

## Stamps and text

Roll-and-write games are played on score sheets: boxes to tick, cross off or write in. In Trayful a sheet is a piece whose drop areas are in `stamp` or `text` mode, and a **stamp** is a component that `is: stamp`. A stamp has a size and a `face`, which is transparent with no outline unless it says otherwise, and nothing else: it does not move, turn, flip or stack. Stamps are never listed in the inventory, since any number of them can be pressed.

<!-- example: examples/roll-and-write/library/sheet.yaml -->

```yaml
container:
  # A row of six boxes for each die face: ring the boxes you use, cross out the ones you give up.
  - id: boxes
    grid: { origin: [30, 25], cols: 6, rows: 6, cell: 10 }
    mode: stamp
    accepts: [ring, cross]
  # What each row scores, written in.
  - id: score
    grid: { origin: [100, 25], cols: 1, rows: 6, cell: [20, 10] }
    mode: text
```

Each spot is a box centred on the spot: a `grid` spot is the size of its cell, a `points` spot as large as the largest stamp it takes, or 10 mm square for text. A stamp is drawn centred in its box; text is drawn centred too, as large as fits.

On the table, a box lights up as a circle under the pointer. Clicking a stamp box stamps it, asking which stamp first when it takes more than one; clicking a text box asks for the text. Right-clicking a box erases it. A locked sheet can still be marked.

Agents use `mark` with `at` set to one spot and either `stamp` or `text` (`at: sheet.1/boxes/4`, `stamp: ring`), and `erase` to clear one. Both can be undone like any other move.

What is on a sheet is saved with it, under `marks` in the [table file](table.md), so it moves with the sheet. Whoever sees the sheet sees its marks: a sheet in a player's hand, or face down, keeps them to itself. To give each player a sheet, put one per player in the inventory. The [Six Rows](../../examples/roll-and-write/README.md) example is a whole game on two sheets.
