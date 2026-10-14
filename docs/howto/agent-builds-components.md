# Let an agent build components

An AI agent connected to Trayful over MCP can design components with you: you describe a card, it writes the type into your library, puts cards in the box, and looks at the result, while you watch the table update in your browser.

## Connect the agent

Open your project on a table, then add Trayful to your agent once. For Claude Code:

```sh
pnpm trayful play my-game
claude mcp add --transport http trayful http://127.0.0.1:4317/mcp
```

See the [main README](../../README.md#let-an-agent-play) for other clients.

## Ask for what you want

For example:

> Add an event card type to my game: landscape, 88 × 63 mm, with a title, a short rule text and a coloured band whose colour depends on the season (spring, summer, autumn, winter). Then add a deck of six events and show me one.

The agent reads the docs and the format reference (the `trayful://docs` resource), then:

1. **`upsert_type`** writes the new type into a library file, keeping your comments and formatting. Calling it again with the same id changes the type.
2. **`set_inventory`** sets which cards of that type are in the box, as an inventory entry with `items`, `from` (a CSV file) or `each`.
3. **`render_component`** returns a picture of the type, front and back, drawn by your browser exactly as on the table, so the agent can check its own work and adjust.
4. **`add_asset`** saves artwork (an SVG it writes, or a PNG) into `assets/`.

Every change is written to your project files, so you can read, edit or commit it like anything you wrote yourself. If a change would break the project, for example a type that drops a field the inventory still uses, nothing is written and the agent gets the error with file, line and column.

## Other things to ask

- "Make the cost circle bigger and move it to the bottom right."
- "Load the cards from `data/events.csv` instead and add a column for the season."
- "Remove the old trade cards." (The agent uses `set_inventory` with an empty list, then `remove_type`.)
- "Make a new table called `playtest-2` with the default setup and deal everyone three cards." (`open_table`, then the play tools.)
- "Start a new project called Moon Market." (`create_project`, when Trayful was started on a folder of projects.)

## Tools for projects and tables

| Tool                                                       | What it does                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `list_projects`                                            | Every project with its tables and any problems in its files     |
| `open_table`, `duplicate_table`, `delete_table`            | Switch to, copy or delete a table; a new table name creates one |
| `create_project`                                           | A new project from the starter template                         |
| `validate_project`                                         | Reload the files and report problems, after editing by hand     |
| `upsert_type`, `remove_type`, `set_inventory`, `add_asset` | Change the components                                           |
| `render_component`                                         | A picture of one component type                                 |

`render_component` and `snapshot` need the table open in a browser, since the browser draws the pictures.
