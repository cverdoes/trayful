# Make your own prototype

A prototype is a folder:

```
my-game/
  trayful.yaml            # project manifest: name and which files to load
  assets.yaml             # named images (whole or cut into tiles) and colours
  library/*.yaml          # components: size, what each is and can do, fields, its face
  inventory.yaml          # what is in the box, and how many of each
  data/*.csv              # optional card data, one row per card
  setups/*.yaml           # optional scripted starting layouts
  assets/                 # images and SVGs
```

Start one from the template, which has a deck of cards loaded from a spreadsheet, some tokens and a setup:

```sh
npx trayful new my-game --name "My Game"
npx trayful play my-game
```

To build components without writing YAML, pick **Design components** in the toolbar's **More** menu: the [designer](../howto/design-components.md) switches behaviours on and off and lays out fields and faces with a live preview, lets you drag labels, layers and board drop areas into place, drop in pictures and rename components everywhere they are used, and saves each change to your library files, keeping your comments.

Keep the table open while you edit: every time you save a file, the table updates (new cards appear, changed text redraws, and the change is one step you can undo). If a file has a mistake, a bar on the table names the file, line and column, and the table keeps the last version that worked. `npx trayful validate my-game` checks a project from the command line.

To keep several games together, put their folders in one folder and run `npx trayful play` on that folder; the table menu switches between them.

The [HOWTO guides](../howto/README.md) walk through adding a deck, designing components in the browser, loading cards from a spreadsheet, boards with drop areas, meeples and dice, your own images and tiled sheets, setups, designing with an agent and printing. Every key is documented in the [format reference](../reference/README.md).

A component describes what it `is` (a `piece`, `zone`, `die`, `counter` or `stamp`) and switches on what it can do: `flippable`, `rotates`, `stackable`, or `values` for dice and counters. A board is a piece that is a `container`: it declares **drop areas**, a `grid` of spots (card slots, action spaces), a list of `points` (a score track) or a free `area` (a supply), each optionally limited to some components with `accepts`. A **setup** file places components on those drop areas and on the table, locks the board, shuffles and deals; set `setup: <file name>` in `trayful.yaml` to start every new table from it. See [`library/pieces.yaml`](../../examples/harvest-moon/library/pieces.yaml) and [`setups/2-player.yaml`](../../examples/harvest-moon/setups/2-player.yaml) in the Harvest Moon sample.
