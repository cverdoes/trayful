# Surfaces

A table can have several **surfaces**: separate play spaces, each with its own positions, such as a main play area and an area for each player. Every table has the **Centre** (id `centre`), and anything not put elsewhere lies there, so a table that never uses surfaces works exactly as before.

Surfaces are not private. Everyone sees every surface; a player's [hand](players-and-hands.md) is still the only private place.

## In the saved table

The table file lists its surfaces besides the Centre in tile order, and each piece or stack lying on one of them names it (see [Table state](table.md#surface)):

```json
{
  "surfaces": [{ "id": "red", "name": "Red player", "seat": true, "player": "sam" }],
  "objects": [{ "kind": "piece", "id": "worker.red.1", "surface": "red", "pos": [0, 0], "...": "..." }]
}
```

- A position belongs to its surface: `[0, 0]` on `red` is a different place from `[0, 0]` on the Centre.
- Only things lying directly on the table have a surface. Pieces in a stack follow the stack; pieces in a hand or a bag have none until they come out.
- Something snapped into a [drop area](snapping.md) lies on the surface of the piece the area belongs to, and moves to another surface with it.
- The Centre is listed only when it has been renamed, and always first.

## Commands

| Command | What it does | Example |
| --- | --- | --- |
| `move` | `surface` with a position in `to` moves there on that surface; `to: "surface:<id>"` finds free room there | `{ "type": "move", "ids": ["worker.red.1"], "to": [0, 0], "surface": "red" }` |
| `draw`, `deal`, `take` | `surface` says which surface positions in `to` are on (default: the Centre); `surface:<id>` works as a target | `{ "type": "draw", "from": "deck:actions", "count": 3, "to": "surface:red" }` |
| `addSurface` | Adds a surface, last or `after` another (`centre` for first); `seat: true` lets a player sit there | `{ "type": "addSurface", "id": "red", "name": "Red player", "seat": true }` |
| `editSurface` | Renames, makes a seat or not, or moves a tile `after` another. The Centre can only be renamed | `{ "type": "editSurface", "id": "red", "name": "Rouge" }` |
| `removeSurface` | Removes a surface; what lies on it moves to free room on the surface `to` | `{ "type": "removeSurface", "id": "red", "to": "centre" }` |
| `sit` | Seats a player at a seat; without `player`, stands whoever sits there up | `{ "type": "sit", "surface": "red", "player": "sam" }` |

A drop area already says where things go, so `surface` cannot be given with one, nor with `by`. Free room on a surface is its origin when nothing lies there, else just below everything at the left. Every one of these commands can be undone by the player who made it, as long as nobody changed the same pieces, or the list of surfaces, since.

Anyone may sit down at or stand up from a seat. Only the host and agents may seat or unseat someone else. Sitting changes nothing about who may touch what; it says whose surfaces the browser shows first.

Agents get the same through the `add_surface`, `edit_surface`, `remove_surface` and `sit` MCP tools, and `describe_table` and `query_objects` take a `surface` to look at one surface only.

## In the browser

On a table with surfaces, each surface shows as a tile of its own, with its own pan and zoom. The Centre takes the larger tile, on the left (or on top in a tall window), and the others share the rest. A table without surfaces looks as it always did: one canvas filling the window.

A row of chips under the toolbar picks what to show:

- **The view menu**: *All surfaces*, *Mine + Centre* (the surfaces you sit at, and the Centre) or *Centre only*. A player sitting at a seat starts on *Mine + Centre*; anyone else starts on *All surfaces*. A view follows the table as surfaces come and go and players sit down.
- **A chip per surface** switches its tile on or off. When someone else changes a surface whose tile is off, its chip pulses for a moment.
- **Focus**: the button by a tile's name, a double-click on the name, or a number key (`1` for the first tile shown, `2` for the next) shows that tile on its own; the same again, or `Esc`, goes back.

What each viewer shows is their own choice, kept in that browser for each table; it changes nothing for anyone else. ### Moving pieces between surfaces

- **Drag from tile to tile.** The tile under the pointer lights up, and the piece lands where it is let go, snapping into spots and joining piles there as on its own surface. The rest of a selection keeps its place around the dragged piece. A card dragged off a pile goes the same way.
- **Drop on a chip** to send pieces to free room on that surface, whether its tile is shown or not. A card from the hand can be dropped on a chip too, or on a tile to land where it is dropped.
- **Send to…** on the toolbar sends the selected pieces to free room on another surface.

### Changing the surfaces

The **+** at the end of the chip row adds a surface or a seat. The **▾** by each chip renames the surface, makes it a seat or not, and removes it, which moves what lies on it to the Centre. At a seat, *Sit here* and *Stand up* seat you. All of it can be undone.
