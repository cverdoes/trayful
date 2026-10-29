# Six Rows (roll-and-write)

A small roll-and-write game that shows stamps and text on score sheets. Each player has a sheet with a row of six boxes for each die face, a score box per row, a total and a name.

To play: roll the three dice. Each player picks one die and rings a box in that row, or crosses out a box in any row instead. A row scores its face times the number of rings in it, written in its score box; the game ends when someone has filled every box.

On the table, hover a box to see it light up, click it to stamp it (pick ring or cross) or write in it, and right-click it to erase it.

| File                   | Shows                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| `trayful.yaml`         | Project manifest, starting new tables from the `2-player` setup             |
| `assets.yaml`          | The sheet drawing, the two stamp images and the colours                     |
| `library/sheet.yaml`   | The sheet with `stamp` and `text` drop areas, the `ring` and `cross` stamps |
| `inventory.yaml`       | Two sheets and three dice; stamps are never listed                          |
| `setups/2-player.yaml` | A sheet for each player and the dice between them                           |

See [Stamps and text spots](../../docs/reference/snapping.md#stamps-and-text) in the reference.
