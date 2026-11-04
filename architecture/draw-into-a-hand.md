---
title: A player draws a card into their hand
kind: interaction
order: 3
summary: How one table becomes a different view for each player, so a hand stays private.
---

Every player looks at the same table, but not the same view of it. Drawing a card into a hand shows how the server keeps it private: the table holds everything, and each watcher is sent only what their player may know.

## Steps

1. **The drag off the deck.** Dragging the top card of a deck onto the hand tray at the bottom of the screen ([[app:HandTray]]) makes [[app:drawCommands]] build a [[command:draw]] command to `hand:<player>`, the player's own hand as a target.
2. **The session checks reach.** As with any command ([[concept:drag-onto-a-row]]), [[server:TableSession|TableSession.act]] checks the player may touch the deck and may draw into that hand: nobody can put pieces in, or take them from, someone else's hand.
3. **The engine moves the card.** [[core:draw]] takes the card off the stack and gives it a `hand` field naming the player. It is still one object in the one [[core:TableState]]; [[core:handOf]] lists a hand's pieces.
4. **A view per watcher.** The session builds each watcher's [[message:state]] message separately with [[core:viewFor]]:
   - the drawing player sees the card, face and all;
   - everyone else does not get the card at all, only that this player now holds one more, in the view's `hands` counts ([[core:handCounts]]);
   - face-down pieces on the table keep only the fields their back shows ([[core:backData]]) and get a stand-in id, so neither their text nor their id gives them away.
5. **Stand-in ids stay consistent.** The session's alias book ([[core:Aliases]]) hands out the stand-in ids and turns them back into real ones when a player sends a command naming a hidden piece ([[core:resolveAliases]]). After a shuffle or an undo the old stand-ins are forgotten, so nobody can follow a card through it.
6. **The activity says what, not which.** Others see "drew a card" from [[server:activityText]], which never names a hidden piece.
7. **The hand is drawn.** In the drawing player's browser, [[app:HandTray]] shows their hand from the view; the other browsers show the new count next to the player's name ([[app/Players.tsx]]).

## Roles

- [[core/views/privacy.ts]] decides what each player may know; it is the only place that does.
- [[server:TableSession]] calls it once per watcher for every change, and remembers who watches as whom.
- [[app]] never receives what it may not show, so nothing hidden can leak from the browser, its devtools or a screenshot.

Agents follow the same rule: an agent is the player `claude`, and its tools see only its own view ([[concept:an-agent-plays]]).
