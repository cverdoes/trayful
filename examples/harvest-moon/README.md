# Harvest Moon (sample prototype)

A small worker-placement and card-market game that uses every Trayful file kind. CI validates it, and the format reference quotes its files as examples, so keep it valid when you change it.

| File                   | Shows                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `trayful.yaml`         | Project manifest, starting new tables from the two-player setup                                                           |
| `assets.yaml`          | Named images, one cut into tiles, and the project's colours                                                               |
| `library/cards.yaml`   | A flippable, stackable card with fields, labels, layers and an image back                                                 |
| `library/pieces.yaml`  | A board that is a container (grids, a score track and a supply area), meeples, markers, a counter and a die showing tiles |
| `inventory.yaml`       | Inline rows with counts, a CSV source, `each` combinations and a deck                                                     |
| `data/actions.csv`     | Card data in a spreadsheet-friendly form                                                                                  |
| `setups/2-player.yaml` | Placing and locking the board, placing into drop areas, shuffling and dealing into the market                             |
| `assets/board.svg`     | Board artwork whose slots match the drop areas                                                                            |
| `assets/dice.svg`      | Six die faces on one sheet, two rows of three                                                                             |
| `assets/art/`          | Card art, given per card through an `image` field                                                                         |

Check it, then play it (after `pnpm build`):

```sh
pnpm trayful validate examples/harvest-moon
pnpm trayful play examples/harvest-moon
```

Played tables are saved in `tables/`, which git ignores.
