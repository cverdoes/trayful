# Units and coordinates

Every length in Trayful is in **millimetres**: component sizes, label and layer positions, drop areas and positions on the table. Fonts are the exception, in points, as in any word processor (1 pt is about 0.35 mm). Angles are in degrees, clockwise.

## On a face

Labels, layers and drop areas are placed in the component's own coordinates:

- `[0, 0]` is the **top-left corner** of the face; x grows to the right and y grows **downwards**.
- `at` is a label's or layer's anchor. For text it is the corner or edge picked by `align` and `valign` (default top-left). For images and rectangles it is the top-left corner. For shapes given a radius `r` (circles and hexes) it is the centre.
- A layer with `rotate` turns around its anchor.

For a 63 × 88 mm card, `[55, 78]` is 8 mm from the right edge and 10 mm from the bottom.

## On the table

Positions on the table are the **centre** of a piece or pile, in millimetres, with y growing downwards. `[0, 0]` is simply where new tables lay things out from; the table has no edges. Setups and agents use the same coordinates, and `describe_table` reports the space in use, so an agent can find free room.

When a board turns, its drop areas turn with it: their positions are in the board's own coordinates and Trayful converts them to the table.

## Sizes

`size` is either one number, for square and round pieces (`size: 16`), or `[width, height]`. Common sizes:

| Component    | Size (mm)    |
| ------------ | ------------ |
| Poker card   | `[63, 88]`   |
| Bridge card  | `[57, 89]`   |
| Mini card    | `[44, 63]`   |
| Tarot card   | `[70, 120]`  |
| Standard die | `16`         |
| Meeple       | `16`         |
| Small token  | `20`         |
| A4 board     | `[297, 210]` |

[Print and play](../howto/print-and-play.md) prints at real size.

The manifest's `units` key only accepts `mm` today. It is there so other units can be added later without changing the meaning of existing files.
