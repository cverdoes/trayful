# Start a project

A Trayful project is a folder of plain text files. The quickest way to get one is to copy the starter template, which has a deck of cards, some tokens and a setup.

## Make the folder

From your Trayful checkout:

```sh
pnpm trayful new ../my-game --name "My Game"
```

This copies [`examples/starter`](../../examples/starter) to `../my-game` and names the game. The folder looks like this:

```
my-game/
  trayful.yaml          # the manifest: the game's name and which files to load
  assets.yaml           # named images and colours
  library/cards.yaml    # components: a card...
  library/pieces.yaml   # ...and a token
  inventory.yaml        # what is in the box
  data/cards.csv        # the card texts, one row per card
  setups/start.yaml     # how a new table is laid out
  assets/card-back.svg  # artwork
```

The manifest ties it together:

<!-- example: examples/starter/trayful.yaml -->

```yaml
name: Starter
format: trayful/2
version: '0.1'
description: A small deck and some tokens to build your own prototype from.
units: mm
assets: assets.yaml
libraries: [library/*.yaml]
inventory: inventory.yaml
setup: start
```

`libraries` loads every YAML file in `library/`, so you can split components over as many files as you like. `assets` names the file that gives the project's images and colours their names (see [Use your own images](your-own-images.md)). `setup: start` means new tables start from `setups/start.yaml`.

## Open it on a table

```sh
pnpm trayful play ../my-game
```

Your browser opens the table with the deck shuffled, two cards dealt face up and the tokens beside them. The table is saved to `my-game/tables/table-1.json` as you play.

## Edit while it is open

Leave the table open and edit any file in the folder: change a card's text in `data/cards.csv`, a colour in `assets.yaml`, or a count in `inventory.yaml`. When you save, the table updates at once. New components appear below the table, removed ones leave it, and the change is one step you can undo.

If a file has a mistake, a bar at the top of the table says what and where (file, line and column), and the table keeps the last version that worked until you fix it. You can also check a project from the command line:

```sh
pnpm trayful validate ../my-game
```

## Keep several games together

Put several project folders in one folder and play that folder:

```sh
pnpm trayful new games/space-race
pnpm trayful new games/moon-market
pnpm trayful play games
```

The menu next to the game's name in the toolbar switches between projects and their tables. **New table** starts a fresh table (for a second playtest, say), **Duplicate this table** copies the current one so you can try two moves from the same position, and **Delete this table** removes a saved table.

## Next

- [Add a deck of cards](add-a-deck.md)
- [Write a setup](write-a-setup.md)
