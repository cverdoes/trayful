---
title: An agent asks a player a question
kind: interaction
order: 8
summary: How something outside the table runs a game, by asking players and following what happens.
---

Trayful does not know any game's rules. Something outside the table can bring them: an agent such as Claude, reading the rules, asks players questions and follows the table as they play. Prompts only advise; players can still move any piece.

## Steps

1. **The agent asks.** It calls [[mcp:prompt]] ([[server/mcp/prompts.ts]]) with the player ids from [[mcp:describe_table]] (or `everyone`), a kind (`message`, `confirm`, `choice`, `pick`, `place`, `number` or `text`) and the text. The tool refuses players who have not been at the table.
2. **The board takes the prompt.** [[server:PromptBoard|PromptBoard.ask]] checks it can be shown with [[core:checkPrompt]], and has [[server:checkPromptReach]] check that every piece and place it names is one its players can see: nothing in someone else's hand or in a bag. It gives the prompt an id, starts its expiry timer if it has one, and remembers it on the table's [[server:TableSession]]. Prompts are not table state: [[core:TableEngine]] never sees them, so they are never undone. Open ones are kept beside the table file ([[server/play/tableFiles.ts]]), so a restart does not lose them.
3. **Only the players asked see it, in their own terms.** The session sends each of them a [[message:prompts]] message with the prompts they have still to answer. [[server:promptAsSeenBy]] swaps a face-down candidate for the stand-in id that player's view uses, so a real id never gives a card away; the message goes out again whenever the table changes, as stand-in ids may change with it. Nobody else is told anything. A browser that connects later gets its waiting prompts straight away ([[server/routes/socket.ts]]).
4. **The player answers.** [[app:Prompts]] shows the oldest prompt in a panel above the hand, or as a bubble next to the piece or place it is anchored to. Pieces and places it asks about glow gold ([[app/table/promptTargets.ts]], [[app:PromptPlaces]]), and a click on one picks it instead of selecting it. The browser sends an [[message:answer]] message; the session turns stand-in ids back into real ones, and [[core:checkAnswer]] checks that it fits (an option or candidate that exists, the right number picked, a whole number in range). An answer that does not fit comes back as an [[message:error]].
5. **The answer goes into the feed.** [[server:EventFeed]] numbers everything that happens at the table: answers, a prompt closing (answered by everyone, or by the first with `until: first`, withdrawn, or expired), moves and undos (with the same few words people see, from [[server:activityText]], and the pieces that changed as a spectator sees them, from [[server:changedInSight]], so no hidden piece is named), and players coming and going.
6. **The agent hears it.** [[mcp:wait_for_events]] returns the events after the `since` it is given, waiting up to 50 seconds when there are none yet. The agent passes back the `next` it got, so it misses nothing between calls. It then moves pieces through the usual tools, as in [[concept:an-agent-plays]].

## Roles

- [[core/views/prompts.ts]] defines prompts and answers and checks them; it knows nothing about players or the network.
- [[server:PromptBoard]] knows who was asked and who has answered; [[server:EventFeed]] keeps the order of events. The session wires them to its listeners.
- [[server/mcp/prompts.ts]] is a thin adapter: another way in, such as a WebSocket for a program written in another language, could use the same board and feed.
