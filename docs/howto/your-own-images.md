# Use your own images

Images go in the project folder, usually under `assets/`, and are drawn by **image layers** on a face. SVG, PNG, JPEG, GIF and WebP all work. SVG stays sharp at any zoom and when printed, so prefer it for line art.

## The same image on every card

A card back is the same for every card, so it names a file directly:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
back:
  fill: ink
  layers:
    - { image: assets/card-back.svg }
```

Without `size`, an image layer covers the whole face. Boards work the same way: Harvest Moon's board face is `{ image: assets/board.svg }`.

## A different image per card

Declare a field of type `image` and use it in the layer. The Harvest Moon action card has an optional `art` field, drawn only when a card has one (`when`):

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
art: image?
```

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
- { image: '{{art}}', at: [5, 15], size: [53, 40], when: '{{art}}' }
```

Each card then names its picture in the inventory, or in an `art` column of a CSV file:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
art: assets/art/harvest.svg
```

## Size and fit

`at` is the image's top-left corner and `size` its size, both in millimetres from the face's top-left corner. `fit` says what happens when the picture's shape differs from `size`:

| `fit`     | Effect                                                  |
| --------- | ------------------------------------------------------- |
| `cover`   | Fills the box and crops what sticks out (the default)   |
| `contain` | Fits the whole picture inside the box, leaving a margin |
| `stretch` | Fills the box exactly, squashing the picture if needed  |

## Tips

- Paths are relative to the project folder and use `/`, even on Windows.
- Trayful checks that images named directly in a type exist. A misspelt path in a card's data shows as an empty box on the table.
- Edited images show up on the table when you save them, like any other file.
- An agent can add artwork for you with the `add_asset` tool, which takes SVG text or a base64 PNG.
