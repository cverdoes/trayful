---
name: trayful
description: Build and play boardgame prototypes on a Trayful table over its MCP server. Use when asked to design cards, boards, tokens, dice, counters, tracks or decks for a game, to lay out or set up a table, or to play a round on it.
---

# Working with Trayful

Trayful is a boardgame prototyping table in the browser. A project is a folder of YAML files (components, the box contents, setups) plus images. Its MCP server, named `trayful`, lets you change those files and play on the table while people watch the same table live.

Trayful does not know any game's rules. You bring them, usually from the game's own files in this repository.

## Before you start

- **Check the connection.** If no `trayful` tools are available, ask the person to start the table (`npx trayful play <project-folder>`) and connect it once with `claude mcp add --transport http trayful http://127.0.0.1:4317/mcp`. Do not try to start it yourself in the background.
- **Find the project.** `list_projects` shows every project and table, and any problems in their files. The tools act on the active table. `open_table` switches to another one, or starts a new table under a new name; `duplicate_table` and `delete_table` copy and remove tables, and `create_project` starts a project from the starter template when Trayful runs on a folder of projects.
- **Read the docs you need.** `trayful://docs` lists the guides and the format reference. Read the page for the task before writing YAML, such as `trayful://docs/howto/add-a-deck.md`, `trayful://docs/reference/library.md` or `trayful://docs/reference/snapping.md`. The reference is generated from the schemas, so it is the truth when this skill and your memory disagree.
- **Old projects.** If a tool says the project is in `trayful/1`, run `migrate_project` first (after asking, since it rewrites files).

## Designing components

Work in small steps, and look at each one:

1. `upsert_type` writes one component type into the library. Calling it again with the same `id` replaces it, so send the whole definition each time.
2. `set_inventory` says how many of it are in the box, as `items` (one row per design), `each` (one per combination of values), or `from` (a CSV file). Give cards a `deck` to make them one stack on the table.
3. `render_component` returns a picture of the type, front and back. Look at it, fix what is off (text overflowing, labels overlapping, colours), and render again. Pass `data` to try a long title or an edge case.
4. `snapshot` shows the whole table when placement matters.

Every edit is checked before it is written. A change that would break the project is refused with the file, line and column, and nothing is written. Read the error, fix the definition and send it again.

Other authoring tools: `rename_type`, `rename_field` and `rename_image` rename things everywhere they are used; `set_color` names a colour (`fill: sea`); `remove_type` deletes a type once `set_inventory` has emptied it; `add_asset` writes an image or CSV file into the project.

### Rules of thumb

- **Units.** Everything is in millimetres. On a face, `[0, 0]` is the top-left corner and y grows downwards. On the table, positions are piece centres, also with y downwards. Fonts are in points. A poker card is `[63, 88]`, a die or meeple `16`, a small token `20`.
- **Behaviours are off unless written.** Cards need `flippable: true` and `stackable: true`; tokens usually also `rotates: true`. A board is a large `piece` with a `container` and none of these.
- **Ids** are lowercase letters, digits and dashes. Components get ids such as `worker.red.1`; decks become stacks named `deck:<deck>`.
- **Fields** feed `{{field}}` placeholders in labels, layers and colours. A face's own `image` takes no placeholder; use `tile: instance` to vary a tiled image per card.
- **Boards and tracks** declare drop areas under `container`: `grid` for regular spots, `points` for a track that bends, `area` for a free space. `mode: group` lets several markers share a spot; `row` lines cards up; `bag` hides what goes in. Name a spot `board/area/3` and a whole area `board/area`.
- **Setups** (`setups/*.yaml`) and the manifest (`trayful.yaml`) have no tools. Edit them as files when the project folder is in your workspace, then run `validate_project`, or tell the person what to add.

### Images

- `add_asset` takes SVG or CSV as `text`, and any image as `base64`. Give it a `name` to use the image on faces, and `rows` and `cols` to cut a sheet into tiles (numbered from 0, left to right, then down).
- Large images do not fit through MCP. Over HTTP a request is limited to 1 MiB, so an image over about 700 KB fails once in base64, and any base64 image costs a lot of context. When the project folder is in your workspace, copy the file into its `assets/` folder with your own file tools instead, name it in `assets.yaml` (`creatures: { file: assets/creatures.png, rows: 3, cols: 4 }`), and run `validate_project`. Open tables pick up the file at once.
- Prefer SVG with a `viewBox` in millimetres for boards you draw yourself, such as `viewBox="0 0 600 400"`, so the drawing lines up with the drop areas. Trayful does not draw the spots; put them in the artwork.

See [recipes.md](recipes.md) for worked examples: a deck from a tiled image, a score track, a board with drop areas, and a deck from a spreadsheet.

## Playing

1. Start with `describe_table`. It lists every pile and piece with its position, every drop area with its free spots, your hand and how many cards the others hold. `query_objects` gives the same as JSON, filtered by type, field values, region or what is inside a stack.
2. Move with `move`, `draw`, `deal`, `take`, `stack`, `flip`, `rotate`, `roll`, `set_counter`, `shuffle`, `layout` and `lock`. Aim at spots by name rather than coordinates when the board has them.
3. `reset_table` starts over from the project's setup, and can be undone. `get_history` shows what people did since you last looked.

Play fair:

- You play as the player `claude`, with your own hand `hand:claude`. Deal to someone with `hand:<player>`. You never see other players' hands.
- Face-down cards and pile order stay hidden unless you pass `reveal: true`. That is peeking: use it only when the rules or the person allow it.
- `undo` and `redo` touch only your own changes. People undo theirs. Do not undo someone else's move to fix a mistake; say what happened instead.

## Things that trip agents up

- `render_component` and `snapshot` need the table open in a browser, since the browser draws the picture. If they fail, ask the person to open the table's URL.
- New components appear on open tables below everything else, not in the setup's places. Use `reset_table` to see the setup lay them out, after asking, since it starts the table over.
- A drop area's coordinates are relative to its board's top-left corner, not the board's centre.
- `move` with a position puts the _centre_ of the piece there.
- Inventory rows may only set fields the type declares under `fields` (labels' fields count too), plus `tile`, `count` and `id`. Declare a field before filling it.
- A drop area's `accepts`, and `stackable.with`, may only name types that exist. Add the pieces before the board that takes them.
- Every CSV row needs every column of the header, even if a value is empty.
- Player ids are names in lowercase with dashes (`hand:sam`). `describe_table` names other players only once they hold something; if a hand is refused, ask the person what name they joined with.
- A `pile` spot only takes stackable pieces that may share a stack; markers that share a space want `mode: group`.
- A face's own `image` names an image in `assets.yaml`, never a path. Image fields and image layers also take a file path, and a misspelt path there shows as an empty box, not an error.
