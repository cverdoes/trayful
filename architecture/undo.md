---
title: A player presses undo
kind: interaction
order: 4
summary: Undo per player on a shared table, and why it is sometimes refused.
---

Several people and an agent can change one table at once, so undo cannot simply step the whole table back. Each player undoes only their own changes, and only while nobody else has touched the same pieces since.

## Steps

1. **The button.** The undo button in [[app/Toolbar.tsx]] is enabled from the `canUndo` flag of the last [[message:state]] message, and sends an [[message:undo]] message.
2. **The session passes it on.** [[server:TableSession|TableSession.handle]] calls the engine's undo for the sending player, labelled "undid their last change" for the others.
3. **The engine finds the player's last change.** [[core:TableEngine]] keeps one history of [[core:HistoryEntry]] records, each with the player who made it and the state before and after. Undo takes that player's latest entry that is still in effect.
4. **It checks nobody changed those pieces since.** The engine compares the objects the entry changed with how they look now. If another player has moved one of them, undoing would overwrite their move, so it throws a [[core:CommandError]] and the player gets an [[message:error]] message instead.
5. **It puts back only those pieces.** Otherwise it restores just the objects that change touched, leaving everyone else's later changes in place, and keeps the entry on that player's redo list.
6. **Everyone gets their view**, as after any change, each with their own `canUndo` and `canRedo` from [[core:TableEngine|canUndoFor]].

## Roles

- [[core/engine.ts]] owns history, undo and redo; nothing else keeps a history.
- [[server:TableSession]] tells the engine who is asking.
- A reset is one whole-table step ([[core:HistoryStep]] `replace`) owned by the player who asked for it. A table catching up with edited project files is a whole-table step too, owned by the table itself.
