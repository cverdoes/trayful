# Snapping

Boards, tiles and zones may declare **snap targets** in their type's `snap` list (see the [library reference](library.md#snaptarget)). Every target has an `id` and exactly one of:

| Kind     | Declares                                            | Spots                                                                 |
| -------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| `grid`   | `origin` (centre of the first spot), `cols`, `rows`, `cell` (spacing) | Numbered from 0, left to right, then top to bottom          |
| `points` | A list of spot centres                              | Numbered from 0 in list order                                         |
| `area`   | `at` (top-left corner) and `size`                   | One free area; pieces keep the position they are dropped at          |

All positions are in the owner's own coordinates: millimetres from its top-left corner.

## Names

A spot is named `owner/target/index` and a whole target `owner/target`. `owner` is the component id of the board (or tile or zone) on the table, or its type id when there is exactly one piece of that type. Harvest Moon's board is a single component, so both its id and its type are `main-board`, and its spots are `main-board/fields/0` to `main-board/fields/7`.

## Accepts

`accepts` lists the type ids and primitive names that may snap to a target, such as `[action-card]` or `[meeple, token]`. Without it, anything may.

## Dropping by hand

While a piece is dragged, the spots that accept it light up. On drop:

1. If the drop point is inside an accepting free area, the piece snaps to that area and stays where it was dropped.
2. Otherwise it snaps to the nearest accepting spot within reach: half the piece's smaller side, and at least 8 mm. Free spots win over taken ones within reach.
3. Otherwise it stays on the table where it was dropped.

A snapped piece takes the spot's centre and the owner's rotation. Several selected pieces dragged together only snap into free areas.

## Riding along

Pieces in a spot belong to that spot's owner: when the board moves or turns, they move and turn with it. This nests, so a token on a tile on a board moves with the board. Dragging a piece out of its spot frees it.

## In setups and agent moves

`at` in a [setup](setup.md) and `to` in the `move`, `draw` and `deal` agent tools accept a spot name:

- A **spot** (`main-board/fields/3`) puts the piece there, even if the spot is taken.
- A **target** (`main-board/market`) as a deal target fills its spots in order, one card each; a setup deal fails if there are fewer spots than cards. Moving one piece to a target picks its first free spot.
- An **area** (`main-board/supply`) places the pieces inside it, side by side, below whatever is already there.

`describe_table` lists every target with its free and taken spots, so an agent knows where things can go.
