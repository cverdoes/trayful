# Players and hands

Everyone at a Trayful table is a **player**: the host who runs `trayful play`, guests who joined through an invite link, and agents connected over MCP, who all play as `claude`. Each player has a private **hand** that only they see.

## Players

| Player | How they get in | May |
| ------ | --------------- | --- |
| Host | Opens the table on the computer running Trayful; no sign-in | Everything: play, manage tables, print, invite |
| Guest | Opens an invite link to a table, then picks a name | Play on the tables they were invited to, and start them over |
| Agent | Connects to `/mcp` on the host's computer | Play and author, as player `claude` |

A player id is made from the name: lowercase letters, digits and dashes, such as `bob` or `asa-oberg` (a second "Bob" becomes `bob-2`). A browser remembers its player in a cookie, so a guest who comes back with the same browser is the same player.

Players, the tables each guest was invited to, and the invites are kept in `.trayful/players.json` in the folder Trayful serves. It holds no passwords, only fingerprints of the browser cookies; the starter's `.gitignore` leaves the folder out of version control. Deleting the file stops every invite link working and forgets every guest.

## Hands

A piece in a hand has `hand: <player id>` in the saved table (see [Table state](table.md#pieceobject)) and is not on the table: its position is unused, and it snaps to nothing.

Anywhere a command takes a place to go, `hand:<player id>` puts pieces into that player's hand:

| Command | Example                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| `draw`  | `{ "type": "draw", "from": "deck:actions", "count": 2, "to": "hand:bob" }`      |
| `deal`  | `{ "type": "deal", "from": "deck:actions", "to": ["hand:alice", "hand:bob"] }`   |
| `take`  | `{ "type": "take", "id": "action-card.harvest.2", "to": "hand:alice" }`          |
| `move`  | `{ "type": "move", "ids": ["action-card.storm"], "to": "hand:claude" }`          |

Moving a pile into a hand puts each of its cards there. Boards and zones cannot go in a hand.

To play pieces from a hand, `move` them `to` a position or snap spot (not in the same command as pieces on the table). They come out face up unless the command says `"face": "down"`; several pieces played together land side by side. `stack` a hand piece onto a pile to put it on top. Only the hand's owner can move, flip or play its pieces.

## What each player sees

Every player gets their own view of the table from the server:

- Their own hand in full. Of other hands, only how many pieces each holds.
- Face-down pieces without their fields, and under a stand-in id such as `hidden-3f9a1c02e4` instead of their real id, since ids such as `action-card.harvest.2` would give the card away. A piece keeps its stand-in while it stays face down, just as you can follow a face-down card with your eyes; shuffling a pile, undo and starting over give every hidden piece a new one.
- No random state or seed, since those predict shuffles.

Agents see the table as player `claude`: their own hand in full, and face-down cards when they ask with `reveal: true`, but never other players' hands. `get_history` names pieces in other hands only as `a hidden piece`.

## Undo

Each player undoes and redoes only their own changes: **Undo** takes back your last move, even if others have moved since, and leaves theirs alone. If someone has since moved the same pieces (drawn from the pile you shuffled, say), your move can no longer be undone and the table says so. Agents undo their own moves too, as `claude`. Changes no one made, such as reloading the project files, cannot be undone from a browser.

## Invites and access

Without `--share` or `--tunnel`, only the host's computer can reach the table. With them, the server answers others too, but only for the tables a browser was invited to. Each invite link is for **one table**: a guest sees and plays that table and no other, and the table menu lists only the tables they were invited to. Only the host can create, duplicate or delete tables, print, make invite links, and use MCP. Changes are only accepted from Trayful's own pages, so other websites open in a browser cannot drive the table.

The invite link looks like `http://192.168.1.20:4317/join/<invite>`. Anyone who has it can join that table, so share it only with your playtesters. **New link** in the invite dialog replaces a table's link, so the old one stops working; guests who already joined keep their place at the table. See [Play with others](../howto/play-with-others.md) for how to start a shared table.
