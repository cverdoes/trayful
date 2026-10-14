# Add a board with snap spots

A board is a large piece that declares **snap targets**: places where cards and pieces click into position, such as card slots, action spaces and score tracks. Pieces in a spot move and turn with the board, and agents can name the spots in their moves.

## Define the board

This is the Harvest Moon farm board, from [`library/pieces.yaml`](../../examples/harvest-moon/library/pieces.yaml):

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: main-board
  base: board
  name: Farm board
  size: [600, 400]
  front:
    layers:
      - { image: assets/board.svg }
  snap:
    - id: market
      grid: { origin: [85, 70], cols: 5, rows: 1, cell: [70, 95] }
      accepts: [action-card]
    - id: fields
      grid: { origin: [110, 200], cols: 4, rows: 2, cell: 50 }
      accepts: [worker]
    - id: supply
      area: { at: [440, 180], size: 140 }
```

All coordinates are millimetres from the board's top-left corner, the same as layers. There are three kinds of target:

- **`grid`**: rows and columns of spots. `origin` is the centre of the first spot and `cell` the distance between spot centres. Spots are numbered from 0, left to right and then top to bottom, so `fields` has spots 0 to 7.
- **`points`**: a list of spot centres in order, for tracks that bend. Harvest Moon's `score-track` is one, with eleven points along the bottom edge.
- **`area`**: a free rectangle, given by its top-left corner and size. Pieces dropped inside stay where they are dropped, like a supply or a discard area.

`accepts` limits a target to some component types (`action-card`) or primitives (`card`, `meeple`). Leave it out to accept anything.

Draw the slots into the board's artwork so people can see them; Trayful highlights the spots while you drag, but does not draw them on the board. Board images are easiest as SVG with a `viewBox` in millimetres, such as `viewBox="0 0 600 400"`, so their coordinates match the snap targets.

## Put it in the box

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- type: main-board
```

Boards start locked, so dragging across them pans the table instead of moving the board. Select the board and press **L** to unlock it.

## Use the spots

On the table, drag a piece near a free spot that accepts it and drop it: it snaps to the spot's centre and takes the board's rotation. Move or rotate the board and everything in its spots comes along.

In a [setup](write-a-setup.md) or an agent's move, a spot is written `board/target/number` and a whole target `board/target`, where `board` is the board's component id:

- `main-board/fields/3` is the fourth field.
- `main-board/market` as a deal target fills the free market slots in order.
- `main-board/supply` drops pieces into the supply area, side by side.

See [Snapping](../reference/snapping.md) for the exact rules.
