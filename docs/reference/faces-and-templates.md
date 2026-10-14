# Faces and templates

A component's look is described per side: `front` (face up) and, for two-sided primitives (cards, tiles and tokens), `back`. Each side is a **face** with an optional `fill` and `stroke` and a list of **layers**, drawn in order so later layers sit on top. All the keys are listed in the [library reference](library.md#face).

## Layers

There are three kinds, chosen by their first key:

| Layer   | Draws                                                    | Main keys                                       |
| ------- | -------------------------------------------------------- | ----------------------------------------------- |
| `text`  | Text, optionally wrapped to `width`                      | `at`, `font`, `color`, `align`, `valign`        |
| `image` | An SVG, PNG, JPEG, GIF or WebP from the project folder   | `at`, `size`, `fit`                             |
| `shape` | `rect`, `circle`, `ellipse`, `hex`, `triangle`, and more | `at`, `size` or `r`, `fill`, `stroke`, `strokeWidth` |

Every layer also takes `rotate`, `opacity` and `when`. Positions are in millimetres from the face's top-left corner; see [Units and coordinates](units-and-coordinates.md).

The component's outline comes from the type: `size`, `shape` and `corner` (rounded corners). A face's `fill` paints inside that outline before any layer. A type-level `fill` is shorthand for `front.fill`, which is handy for one-sided pieces such as meeples.

## Templates

Any text, image path or colour may contain `{{field}}` placeholders. Each component fills them in from its own data, which comes from the inventory:

```yaml
fields:
  name: string
  suit: { enum: [red, green] }
front:
  fill: '{{suit}}'
  layers:
    - { text: '{{name}}', at: [5, 5] }
```

- Every placeholder must name a field of the type; the validator reports any that do not.
- A field without a value (an optional field left out) becomes empty text.
- Quote values that start with `{{` in YAML, as in `'{{suit}}'`, or YAML reads them as a map.

## Showing a layer only sometimes

`when` takes a template. The layer is drawn only when it comes out as something other than empty, `false` or `0`:

```yaml
- { image: '{{art}}', at: [5, 15], size: [53, 40], when: '{{art}}' }
```

Use a `bool` field for on/off details (`when: '{{starter}}'`), or an optional field to draw a layer only for components that have it.

## Colours

A colour is any CSS colour (`'#d94b3d'`, `white`, `rgb(20 40 60)`), a name from a **palette**, or a template that becomes one. A palette is declared at the top of a library file and shared by the whole project:

```yaml
palette:
  red: '#d94b3d'
  ink: '#222233'
```

Palette names win over CSS names, so `red` above means the palette's red. Two libraries may not give one palette name different values.

## Images

Image paths are relative to the project folder, use `/` on every system, and may be templates such as `'{{art}}'` (with an `image` field). Paths written directly in a type are checked when the project loads; paths that come from data are not, and show as an empty box when wrong. See [Use your own images](../howto/your-own-images.md).
