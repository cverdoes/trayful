# Add meeples, dice and counters

Small pieces each have a primitive with its own behaviour on the table. All of these are in the Harvest Moon sample's [`library/pieces.yaml`](../../examples/harvest-moon/library/pieces.yaml) and the starter's [`library/pieces.yaml`](../../examples/starter/library/pieces.yaml).

## Meeples in player colours

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: worker
  base: meeple
  size: 16
  fields:
    color: { enum: [red, green] }
  fill: '{{color}}'
```

A meeple is drawn from a meeple silhouette, filled with `fill`. Here the colour is a field, so one type covers both players. In the inventory, `each` makes one design per value, and `count` copies of each:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- type: worker
  each: { color: [red, green] }
  count: 5
```

That is ten workers: `worker.red.1` to `worker.red.5` and `worker.green.1` to `worker.green.5`.

## Tokens

<!-- example: examples/starter/library/pieces.yaml -->

```yaml
- id: token
  base: token
  name: Token
  shape: disc
  size: 20
  fields:
    color: { enum: [blue, orange] }
  fill: '{{color}}'
```

Tokens are flat and can have two sides (give a `back` to make them flippable, like a coin). `shape` can be `disc`, `rect`, `hex`, `triangle`, `circle`, `ellipse` or `cube`.

## Dice

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: d6
  base: die
  size: 16
  faces: [1, 2, 3, 4, 5, 6]
```

`faces` can be numbers or words, such as `[sun, rain, rain, wind, sun, frost]`. Double-click a die or press **R** to roll it. Rolls use the table's seeded random generator, so a table started with the same `--seed` rolls the same way.

## Counters

<!-- example: examples/harvest-moon/library/pieces.yaml -->

```yaml
- id: coins
  base: counter
  size: [30, 20]
  range: [0, 99]
```

A counter shows a number between the two ends of `range`. Select it and press **+** or **−** to change it. Use one for each player's coins, a round marker or a timer.

## Several of one piece

`count` on an inventory entry makes copies:

<!-- example: examples/harvest-moon/inventory.yaml -->

```yaml
- type: d6
  count: 2
```
