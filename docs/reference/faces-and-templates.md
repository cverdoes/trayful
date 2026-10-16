# Faces and templates

A component's look is its `face`: the outline, and how the front is drawn. A component that is `flippable` may also describe its back, as `flippable: { back: ... }`. All the keys are listed in the [library reference](library.md#face).

## The face

| Key      | What it does                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------- |
| `shape`  | The outline: `rect` (the default), `circle`, `ellipse`, `hex`, `triangle`, `meeple`, `cube` or `disc` |
| `corner` | Rounded corners, as a radius in millimetres                                                           |
| `fill`   | The colour inside the outline, drawn first                                                            |
| `stroke` | The outline's colour                                                                                  |
| `image`  | An image from the assets file covering the face, or one tile of it                                    |
| `layers` | Advanced: shapes, images and text, drawn over the image                                               |
| `labels` | Text, drawn last, on top of everything else                                                           |

The back takes the same keys apart from `shape` and `corner`: both sides share one outline. A flippable component that describes no back gets a plain dark one.

## Labels

A label is a piece of text. Give it a `field` to show each component's own value of that field, or `text` for fixed text:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
labels:
  - { field: name, at: [5, 5], font: { size: 14, weight: bold }, color: white }
  - { field: text, at: [5, 60], width: 53, font: { size: 9 }, color: white }
  - { field: cost, at: [55, 8], align: center, valign: middle, font: { weight: bold } }
```

`at` places the label, `width` wraps it, `align` and `valign` say which corner or edge `at` is, and `font` and `color` style it. A label's `field` need not be declared under `fields`: it then becomes an optional text field.

## Layers

Layers draw anything a face image and labels do not: a band of colour, a circle behind a number, a picture placed somewhere on the face. There are three kinds, chosen by their first key:

| Layer   | Draws                                                    | Main keys                                            |
| ------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `text`  | Text, optionally wrapped to `width`                      | `at`, `font`, `color`, `align`, `valign`             |
| `image` | An image asset by name, or a file in the project folder  | `at`, `size`, `fit`                                  |
| `shape` | `rect`, `circle`, `ellipse`, `hex`, `triangle`, and more | `at`, `size` or `r`, `fill`, `stroke`, `strokeWidth` |

Every layer and label also takes `rotate`, `opacity` and `when`. Positions are in millimetres from the face's top-left corner; see [Units and coordinates](units-and-coordinates.md).

A face is drawn in this order: `fill`, then `image`, then `layers` in list order, then `labels` in list order. Later items sit on top of earlier ones.

## Templates

Label and layer text, image layers' images and colours may contain `{{field}}` placeholders. A face's own `image` names an asset and takes no placeholders; use `tile: instance` to vary it per component. Each component fills them in from its own data, which comes from the inventory:

```yaml
fields:
  name: string
  suit: { enum: [red, green] }
face:
  fill: '{{suit}}'
  labels:
    - { text: 'The {{name}}', at: [5, 5] }
```

- Every placeholder must name a field of the component; the validator reports any that do not.
- A field without a value (an optional field left out) becomes empty text.
- Quote values that start with `{{` in YAML, as in `'{{suit}}'`, or YAML reads them as a map.

## Showing a layer only sometimes

`when` takes a template. The layer or label is drawn only when it comes out as something other than empty, `false` or `0`:

<!-- example: examples/harvest-moon/library/cards.yaml -->

```yaml
- { image: '{{art}}', at: [5, 15], when: '{{art}}', size: [53, 40] }
```

Use a `bool` field for on/off details (`when: '{{starter}}'`), or an optional field to draw a layer only for components that have it.

## Colours

A colour is any CSS colour (`'#d94b3d'`, `white`, `rgb(20 40 60)`), a name from the assets file's `colors`, or a template that becomes one. The colours are shared by the whole project:

<!-- example: examples/harvest-moon/assets.yaml -->

```yaml
colors:
  red: '#d94b3d'
  green: '#4a9b5f'
  gold: '#e2b33c'
  ink: '#222233'
```

Named colours win over CSS names, so `red` above means this red, not the browser's.

## Images

A face's `image` names an image in the [assets file](assets.md). It may be the name alone, for the whole image, or `{ asset, tile }` for one tile of an image cut into `rows` and `cols`:

| Written                                   | Shows                                                                |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `image: board`                            | The whole image, or for a die or counter, the tile of its value      |
| `image: { asset: icons, tile: 4 }`        | Tile 4, counting from 0, left to right, then top to bottom           |
| `image: { asset: icons, row: 1, col: 1 }` | The same tile, by row and column                                     |
| `image: { asset: icons, tile: instance }` | The tile each component names with a `tile` value in the inventory   |
| `image: { asset: dice, tile: value }`     | The tile of a die's or counter's value: the first value shows tile 0 |

`fit` (`cover`, `contain` or `stretch`) says how the image fills the face.

An image layer's `image` is an asset name or a path relative to the project folder, using `/` on every system, and may be a template such as `'{{art}}'` (with an `image` field). Images in the assets file and names written directly in a component are checked when the project loads; names that come from data are not, and show as an empty box when wrong. See [Use your own images](../howto/your-own-images.md).
