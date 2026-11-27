# Let an agent play

Trayful is an [MCP](https://modelcontextprotocol.io) server, so agents such as Claude Code or Claude Desktop can read the table and play on it. Their moves show up live in your browser, with a note saying what they did. They undo only their own moves, and you only yours.

## Connect an agent

The simplest way: start the table, then point the agent at it over HTTP.

```sh
npx trayful play my-game
claude mcp add --transport http trayful http://127.0.0.1:4317/mcp   # in another terminal, once
```

Then ask Claude something like "shuffle the deck, deal three cards to two players and play a round". It starts with `describe_table`, which lists every pile and piece with its position.

For clients that start MCP servers themselves (stdio), run `trayful mcp`. It joins the table that `trayful play` has open, or opens the table itself so you can watch at http://127.0.0.1:4317:

```sh
claude mcp add trayful -- npx -y trayful mcp /path/to/my-game
```

In Claude Desktop the same goes in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trayful": {
      "command": "npx",
      "args": ["-y", "trayful", "mcp", "/path/to/my-game"]
    }
  }
}
```

## Tools for playing

| Tools                                                                                                         | What they do                                      |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `describe_table`, `query_objects`, `snapshot`                                                                 | Read the table as text or JSON, or as a PNG image |
| `move`, `flip`, `rotate`, `stack`, `draw`, `deal`, `take`, `layout`, `shuffle`, `roll`, `set_counter`, `lock` | Play, the same moves people make                  |
| `undo`, `redo`, `get_history`, `reset_table`                                                                  | Its own undo, the history, and a fresh table      |

Agents can aim moves at board spots by name, such as `main-board/fields/3`, or deal into a whole drop area such as `main-board/market`; `describe_table` lists every drop area and which spots are free. Face-down cards stay hidden from the agent unless it asks with `reveal: true`. The agent plays as **Claude**, with its own hand (`hand:claude`); it can deal into anyone's hand with `hand:<player>`, but never sees other players' hands. MCP is only offered on your own computer, never to guests. `snapshot` needs the table open in a browser, since the browser draws the picture. Resources give the full table state, the project, each component, the file format schemas and these docs (`trayful://docs`).

## Building with an agent

Agents can also build your prototype with you: ask Claude for "an event card with a title, a rule text and a season band, and a deck of six events", and it writes the component into your library, puts the cards in the box and looks at a picture of the result, while the new deck appears on your table. Every change is checked first, so an agent cannot leave your project broken. See [Let an agent build components](../howto/agent-builds-components.md).

Trayful also serves a [skill](../../skills/trayful/SKILL.md) that teaches agents how to work with it: the design loop, recipes for decks, tracks and boards, and the things that trip agents up. Agents that support skills over MCP find it on their own, as `skill://trayful/SKILL.md`, always in the version of the Trayful they are connected to; the server instructions point other agents to it. For agents that do neither, `npx trayful skill` copies it into your game's repository. See [Use Trayful from your game's repository](../howto/game-repository.md).

| Projects and authoring tools                                              | What they do                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `list_projects`, `open_table`, `duplicate_table`, `delete_table`          | Find projects and tables, and switch the table the agent plays on |
| `create_project`, `validate_project`                                      | Start a project from the starter template; check one after edits  |
| `migrate_project`                                                         | Rewrite a `trayful/1` project in the current file format          |
| `upsert_type`, `rename_type`, `remove_type`, `set_inventory`, `add_asset` | Change components, what is in the box, and artwork                |
| `render_component`                                                        | A picture of one component, as people will see it                 |
