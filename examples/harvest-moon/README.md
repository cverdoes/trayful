# Harvest Moon (sample prototype)

A small worker-placement and card-market game that uses every Trayful file kind. CI validates it, and the format reference quotes its files as examples, so keep it valid when you change it.

| File                   | Shows                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `trayful.yaml`         | Project manifest                                                                |
| `library/cards.yaml`   | A card type with fields, a templated front, a palette and an image back         |
| `library/pieces.yaml`  | A board with snap grids and a score track, meeples, tokens, a counter and a die |
| `inventory.yaml`       | Inline rows with counts, a CSV source, `each` combinations and a deck           |
| `data/actions.csv`     | Card data in a spreadsheet-friendly form                                        |
| `setups/2-player.yaml` | Placing, shuffling and dealing at the start of a game                           |

Check it, then play it (after `pnpm build`):

```sh
pnpm trayful validate examples/harvest-moon
pnpm trayful play examples/harvest-moon
```

Played tables are saved in `tables/`, which git ignores.
