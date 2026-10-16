# Add a board with drop areas

A board is a piece that is a **container**: it declares **drop areas**, places where cards and pieces click into position, such as card slots, action spaces and score tracks. What lies in a drop area belongs to the board, so it moves and turns with it, and agents can name the spots in their moves.

## Define the board

This is the Harvest Moon farm board, from [`library/pieces.yaml`](../../examples/harvest-moon/library/pieces.yaml):

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: main-board
  name: Farm board
  size: [600, 400]
  is: piece
  rotates: true
  face:
    image: board
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

A board is a plain `piece` with a large `size`. It does not switch on `flippable` or `stackable`, so it has one side and never ends up in a pile. `face: { image: board }` covers it with the image named `board` in the project's [`assets.yaml`](../../examples/harvest-moon/assets.yaml).

`container` lists its drop areas. All coordinates are millimetres from the board's top-left corner, the same as on a face. There are three kinds:

- **`grid`**: rows and columns of spots. `origin` is the centre of the first spot and `cell` the distance between spot centres. Spots are numbered from 0, left to right and then top to bottom, so `fields` has spots 0 to 7.
- **`points`**: a list of spot centres in order, for tracks that bend. Harvest Moon's `score-track` is one, with eleven points along the bottom edge.
- **`area`**: a free rectangle, given by its top-left corner and size. Pieces dropped inside stay where they are dropped, like a supply or a discard area.

`accepts` limits a drop area to some components (`action-card`) or to what they are (`piece`, `die`, `counter`, `zone`). Leave it out to accept anything.

Draw the slots into the board's artwork so people can see them; Trayful highlights the spots while you drag, but does not draw them on the board. Board images are easiest as SVG with a `viewBox` in millimetres, such as `viewBox="0 0 600 400"`, so their coordinates match the drop areas.

Anything can be a container, not only boards: a player mat, a tile with a slot for a worker, or a `zone` (a dashed area of the table) that collects a discard pile.

## Put it in the box

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- component: main-board
```

## Lock it in place

A board you drag by accident takes everything on it along. Lock it in the setup that places it:

<!-- example: examples/harvest-moon/setups/2-player.yaml -->

```yaml
- place: main-board
  at: [0, 0]
  lock: true
```

A locked piece cannot be moved, turned, flipped or taken into a hand, and dragging across it pans the table instead. Select it and press **L** to unlock it, and again to lock it.

## Use the spots

On the table, drag a piece near a free spot that accepts it and drop it: it snaps to the spot's centre and takes the board's rotation. Move or rotate the board and everything in its drop areas comes along.

In a [setup](write-a-setup.md) or an agent's move, a spot is written `board/area/number` and a whole drop area `board/area`, where `board` is the board's component id:

- `main-board/fields/3` is the fourth field.
- `main-board/market` as a deal target fills the free market slots in order.
- `main-board/supply` drops pieces into the supply area, side by side.

See [Snapping](../reference/snapping.md) for the exact rules.
