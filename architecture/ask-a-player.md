---
title: An agent asks a player a question
kind: interaction
order: 8
summary: How something outside the table runs a game, by asking players and following what happens.
---

Trayful does not know any game's rules. Something outside the table can bring them: an agent such as Claude, reading the rules, asks players questions and follows the table as they play. Prompts only advise; players can still move any piece.

## Steps

1. **The agent asks.** It calls [[mcp:prompt]] ([[server/mcp/prompts.ts]]) with the player ids from [[mcp:describe_table]], a kind (`message`, `confirm` or `choice`) and the text. The tool refuses players who have not been at the table.
2. **The board takes the prompt.** [[server:PromptBoard|PromptBoard.ask]] checks it can be shown with [[core:checkPrompt]], gives it an id and remembers it on the table's [[server:TableSession]]. Prompts are not table state: [[core:TableEngine]] never sees them, so they are never undone or saved.
3. **Only the players asked see it.** The session sends each of them a [[message:prompts]] message with the prompts they have still to answer. Nobody else is told anything, so a prompt for one player stays between them and the agent. A browser that connects later gets its waiting prompts straight away ([[server/routes/socket.ts]]).
4. **The player answers.** [[app:Prompts]] shows the oldest prompt in a panel above the hand and sends an [[message:answer]] message. [[core:checkAnswer]] checks that it fits (an option that exists, the right number picked); an answer that does not fit comes back as an [[message:error]].
5. **The answer goes into the feed.** [[server:EventFeed]] numbers everything that happens at the table: answers, a prompt closing once everyone it was for has answered, moves (with the same few words people see, from [[server:activityText]], so no hidden piece is named), undo and redo, and players coming and going.
6. **The agent hears it.** [[mcp:wait_for_events]] returns the events after the `since` it is given, waiting up to 50 seconds when there are none yet. The agent passes back the `next` it got, so it misses nothing between calls. It then moves pieces through the usual tools, as in [[concept:an-agent-plays]].

## Roles

- [[core/views/prompts.ts]] defines prompts and answers and checks them; it knows nothing about players or the network.
- [[server:PromptBoard]] knows who was asked and who has answered; [[server:EventFeed]] keeps the order of events. The session wires them to its listeners.
- [[server/mcp/prompts.ts]] is a thin adapter: another way in, such as a WebSocket for a program written in another language, could use the same board and feed.
