---
title: A player drags a card onto a row
kind: interaction
order: 2
summary: The path every change takes, from a gesture in the browser to every player's screen.
---

Dropping a card on a board's row of cards is the path every change takes: the browser turns a gesture into a command, the server checks and applies it, and every watcher gets the new table.

## Steps

1. **The drag.** [[app:TableDrag]] in [[app/drag.ts]] moves the card's canvas node while the pointer moves, and asks [[app:snapHint]] for the drop areas it could land in, which the table highlights.
2. **The drop becomes a command.** On release, [[app:moveCommands]] in [[app/drops.ts]] decides what the drop means. Over a row's area it is a [[command:move]] with `into` naming the row, such as `{ type: 'move', ids: ['card.3'], by: [12, -40], into: 'board.1/market' }`. The app never changes the table itself.
3. **The command goes over the WebSocket.** The store's `command` wraps it in a [[message:command]] message and sends it on the socket that [[app:connect]] opened.
4. **The server finds the table and the player.** [[server:registerSocket]] parses the message and passes it, with the sender's player id, to [[server:TableSession|TableSession.handle]].
5. **The session checks reach.** [[server:TableSession|TableSession.act]] swaps stand-in ids for real ones with [[core:resolveAliases]], refuses pieces in someone else's hand, and labels the change for others with [[server:activityText]], such as "moved a card".
6. **The engine applies it.** [[core:TableEngine|TableEngine.dispatch]] calls [[core:applyCommand]], which runs the command in a [[core:Transaction]]: a working copy that copies only the objects it touches. [[core:move]] relocates the card and records that it now sits in the row.
7. **The row settles.** After every command [[core:settle]] tidies the drop areas it touched: a row closes up left to right with a small gap, grows by one slot so the next drop also lands in it, and centres its cards across. The rules for spots live in [[core/snap.ts]].
8. **Undo is recorded.** The engine keeps a [[core:HistoryEntry]] with the state before and after, under the player who made the change.
9. **Everyone gets their view.** The engine's listener in the session sends each watcher a [[message:state]] message built by [[core:viewFor]]: the same table, but with other players' hands and face-down faces hidden. The session also saves the table to `tables/<name>.json` a moment later.
10. **The browsers redraw.** [[app/store.ts]] takes the new view, newer than its last revision, and [[app/Table.tsx]] redraws the moved card where the server put it.

## Roles

- [[app]] interprets the gesture and draws the result.
- [[server]] knows who sent it and what they may reach.
- [[core]] decides what the command does; an invalid one throws [[core:CommandError]] and changes nothing.

If the command is refused, the session sends an [[message:error]] message to the sender only; the table itself never changed, so every view still shows the card where it was.
