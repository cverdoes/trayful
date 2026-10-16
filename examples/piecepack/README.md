# Piecepack (stress test)

The [piecepack](https://en.wikipedia.org/wiki/Piecepack) is a public-domain game system: 24 tiles, 24 coins, 4 dice and 4 pawns in four suits (suns, moons, crowns and arms) and six ranks (null, ace, 2 to 5). Hundreds of games are played with it. This project builds the set in Trayful and lays out two of those games, to find what Trayful cannot do yet. A coin's back shows its suit, so everyone can tell the suit of a coin lying suit side up, in the browser and as an agent. CI validates it like the other examples.

| File                         | Shows                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `library/piecepack.yaml`     | Tiles with a 2 × 2 grid on the back, coins with their suit on the back, pawns, and a die each |
| `library/boards.yaml`        | A zone with the 9 × 9 Tablut points, laid over the tiles (see the limits below)               |
| `data/suits-and-ranks.csv`   | The 24 suit and rank pairs, used by both the tiles and the coins                              |
| `setups/backgammon.yaml`     | The 24 tiles face down as points, twelve checkers a side, two dice                            |
| `setups/tablut.yaml`         | 4 × 4 face-down tiles, 16 attackers, 8 defenders and the king on the points where lines cross |
| `assets/symbols/`, `assets/` | The suit symbols, and a strip of six faces for each die                                       |

The game layouts follow the piecepack rulesets by Trevor L Davis ([pprules](https://github.com/piecepackr/pprules), CC BY-SA 4.0); Backgammon is played with 12 checkers a side, since the set has 24 coins.

```sh
pnpm trayful play examples/piecepack                                      # Backgammon
pnpm trayful play examples/piecepack --table tablut --setup tablut
```

## What Trayful could not do

Found while building the set and playing both games, in the browser and as an agent. Most important first.

1. **No way to show a value differently from how it is stored.** The rank `null` should show nothing and `ace` should show `A`. A label can only print a field as it is, and `when` only tests whether a value is empty, so the CSV carries an extra `mark` column next to `rank`. The `symbol` column repeats the suit's image path on every row for the same reason.
2. **A die cannot pick its image by a field.** The four dice are the same except for the suit, but an image is named in the type, so there are four die types. Without an image, a die's value is always black text.
3. **A board made of tiles has no shared spots.** Drop areas belong to one component, and the Tablut points fall where four tiles meet. The project adds a zone that is not in the box and lays it over the tiles. Its points also sit on top of each tile's own middle spot, so a coin dropped there may go to either.
4. **The box is the same for every game.** The inventory belongs to the project, not to a setup. In Backgammon the Tablut zone and the unused pawns and dice are laid out in rows. In Tablut the eight spare tiles are laid out too.
5. **Setups are long.** Placing 24 tiles and 24 coins takes 48 steps, one per piece. There is no way to place a list of pieces along a row or into a run of spots.
6. **A new table can only start from the default setup in the browser.** The other setup is reached from the command line (`--setup`) or by an agent (`open_table`).
7. **Stack ids are reused.** After a stack empties, its id (`stack:1`) can be given to a new stack elsewhere, so an agent following a pile by id can pick up the wrong one.
