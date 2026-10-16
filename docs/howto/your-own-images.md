# Use your own images

Images go in the project folder, usually under `assets/`. SVG, PNG, JPEG, GIF and WebP all work. SVG stays sharp at any zoom and when printed, so prefer it for line art.

## Name them in the assets file

Give each image a name in `assets.yaml`, next to `trayful.yaml`. This is Harvest Moon's:

<!-- example: examples/harvest-moon/assets.yaml -->

```yaml
images:
  card-back: assets/card-back.svg
  board: assets/board.svg
  dice: { file: assets/dice.svg, rows: 2, cols: 3 }
```

Faces refer to images by these names, so you can move or replace a file and change only this line. The same file holds the project's named colours under `colors:`. The [assets reference](../reference/assets.md) lists every key.

## The same image on every card

A face's `image` covers the whole face. A card back is the same for every card, so it names the image directly:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
flippable:
  back:
    fill: ink
    image: card-back
```

Boards work the same way: Harvest Moon's board has `face: { image: board }`.

## A different image per card

Declare a field of type `image` and draw it with an image layer. The Harvest Moon action card has an optional `art` field, drawn only when a card has one (`when`):

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
art: image?
```

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
- { image: '{{art}}', at: [5, 15], when: '{{art}}', size: [53, 40] }
```

Each card then names its picture in the inventory, or in an `art` column of a CSV file, as a file path or as the name of an image in the assets file:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
art: assets/art/harvest.svg
```

## Tiled images

Card art often comes as one sheet with many pictures on it, and dice as a strip of faces. Give such an image `rows` and `cols` in the assets file and Trayful cuts it into equal tiles, numbered from 0, left to right and then top to bottom. Harvest Moon's `dice` is a sheet of six tiles in two rows of three:

<!-- example: examples/harvest-moon/assets.yaml -->

```yaml
dice: { file: assets/dice.svg, rows: 2, cols: 3 }
```

A face then shows one tile, written `{ asset, tile }`:

```yaml
face:
  image: { asset: icons, tile: 4 }
```

`{ asset: icons, row: 1, col: 1 }` picks the same tile by row and column, counting from 0.

### One tile per card

When every card shows a different tile of the same sheet, write `tile: instance`, and give each card its tile in the inventory:

```yaml
# library/cards.yaml
- id: creature
  size: [63, 88]
  is: piece
  flippable: true
  stackable: true
  face:
    image: { asset: creatures, tile: instance }
```

```yaml
# inventory.yaml
- component: creature
  deck: creatures
  items:
    - { name: Fox, tile: 0 }
    - { name: Owl, tile: 1 }
    - { name: Hare, tile: 2 }
```

`tile` works like any other field: it can be a column of a CSV file, and a card that leaves it out shows tile 0.

### A die that shows its value

A die or counter with a tiled image shows the tile of its value: the lowest value (or the first in its `list`) shows tile 0, the next tile 1, and so on. That is all Harvest Moon's six-sided die needs:

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: d6
  size: 16
  is: die
  face:
    corner: 2
    # A sheet of six tiles; a die shows the tile of its value.
    image: dice
```

Roll it, and a 4 shows tile 3. `image: { asset: dice, tile: value }` says the same thing in full.

## Size and fit

A face's image fills the face. An image layer's `at` is its top-left corner and `size` its size, both in millimetres from the face's top-left corner; without `size` it also covers the whole face. `fit`, on either, says what happens when the picture's shape differs from the box:

| `fit`     | Effect                                                  |
| --------- | ------------------------------------------------------- |
| `cover`   | Fills the box and crops what sticks out (the default)   |
| `contain` | Fits the whole picture inside the box, leaving a margin |
| `stretch` | Fills the box exactly, squashing the picture if needed  |

## Tips

- Paths are relative to the project folder and use `/`, even on Windows.
- Trayful checks that every image in the assets file exists, and that faces name images the assets file has. A misspelt path in a card's data shows as an empty box on the table.
- Edited images show up on the table when you save them, like any other file.
- An agent can add artwork for you with the `add_asset` tool, which takes SVG text or a base64 PNG.
