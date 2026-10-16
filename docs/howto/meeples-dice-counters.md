# Add meeples, dice and counters

Small pieces are components like any other: a meeple or a token is a `piece` with a shape, and dice and counters have a value. All of these are in the Harvest Moon sample's [`library/pieces.yaml`](../../examples/harvest-moon/library/pieces.yaml) and the starter's [`library/pieces.yaml`](../../examples/starter/library/pieces.yaml).

## Meeples in player colours

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: worker
  size: 16
  is: piece
  rotates: true
  fields:
    color: { enum: [red, green] }
  face:
    shape: meeple
    fill: '{{color}}'
```

`shape: meeple` draws a meeple silhouette, filled with `fill`. Here the colour is a field, so one component covers both players. A meeple has one side and does not stack, so it leaves out `flippable` and `stackable`. In the inventory, `each` makes one design per value, and `count` copies of each:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- component: worker
  each: { color: [red, green] }
  count: 5
```

That is ten workers: `worker.red.1` to `worker.red.5` and `worker.green.1` to `worker.green.5`.

## Tokens

<!-- example: examples/starter/library/pieces.yaml -->

```yaml
- id: token
  name: Token
  size: 20
  is: piece
  flippable: true
  rotates: true
  stackable: true
  fields:
    color: { enum: [blue, orange] }
  face:
    shape: disc
    fill: '{{color}}'
```

A token is flat: `flippable: true` gives it a plain back, like a coin, and `stackable: true` lets tokens pile up. `shape` can be `disc`, `rect`, `hex`, `triangle`, `circle`, `ellipse`, `cube` or `meeple`. To let tokens share a pile with something else, such as coins of two values, name it: `stackable: { with: [coin-5] }`.

## Dice

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

`is: die` gives it a value, from 1 to 6 unless it says otherwise, and lets it roll. Without an image, a die shows its value as a large number; Harvest Moon's shows the matching tile of the six-tile `dice` image instead (see [Use your own images](your-own-images.md#a-die-that-shows-its-value)). Other dice give their `values`:

```yaml
values:
  list: [sun, rain, rain, wind, sun, frost]
```

or `range: [1, 20]` for a twenty-sided die. Double-click a die or press **R** to roll it. Rolls use the table's seeded random generator, so a table started with the same `--seed` rolls the same way.

## Counters

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: coins
  size: [30, 20]
  is: counter
```

A counter shows a number, from 0 to 99 unless its `values` say otherwise (`values: { range: [0, 20] }`). Select it and press **+** or **−** to change it. Use one for each player's coins, a round marker or a timer.

Dice and counters differ only in how their value changes: dice `roll` and counters `step`. `values: { controls: [roll, step] }` gives one both, such as a die you may also turn to a chosen side.

## Several of one piece

`count` on an inventory entry makes copies:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- component: d6
  count: 2
```
