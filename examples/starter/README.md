# Starter (template project)

The smallest useful prototype: a deck of cards whose text comes from a spreadsheet, a few tokens, and a setup. `trayful new` and the `create_project` MCP tool copy this folder to start a new project, so keep it small and valid; CI validates it.

| File                  | Shows                                                        |
| --------------------- | ------------------------------------------------------------ |
| `trayful.yaml`        | Project manifest, starting new tables from the `start` setup |
| `library/cards.yaml`  | A card type with a templated front and an image back         |
| `library/pieces.yaml` | A round token in two colours                                 |
| `inventory.yaml`      | A deck loaded from CSV, and tokens made with `each`          |
| `data/cards.csv`      | One row per card design, with a `count` column               |
| `setups/start.yaml`   | Shuffling, dealing face up and placing tokens                |

The [HOWTO guides](../../docs/howto/README.md) start from this project.
