---
title: An engine knocks to join a table
kind: interaction
order: 9
summary: How a program that runs a game asks the host to let it in, and then plays and asks players over the WebSocket.
---

An engine is a program that runs a game from outside the table, written in any language: a referee, a tutorial, a bot. Instead of a token the host copies by hand, the engine knocks and the host answers a prompt. Engines only advise, like the agent in [[concept:ask-a-player]]: players can still move any piece.

## Steps

1. **The engine knocks.** It posts its name (with [[engine-client:knock]], or by hand) to [[route:POST /api/knock]] ([[server/routes/engines.ts]]). The route needs no invite, so [[server:Knocks]] keeps it from flooding the host: one knock at a time from an address, a few at a time per table, and a minute's wait after the host says no.
2. **The host is asked.** [[server:Knocks|Knocks.knock]] asks the host, through the table's [[server:PromptBoard]], a choice from Trayful: Allow, Allow with full view, or Deny. The prompt is passing: it is not kept with the table, since the engine that knocked is gone after a restart. The request waits on [[server:PromptBoard|PromptBoard.settled]] for up to a minute and a half.
3. **An engine let in gets its own secret.** [[server:Players|Players.admitEngine]] adds a player with the role `engine`, lets it into this table only, and notes whether it may see everything there. The reply carries its id and secret, so nobody copies a token.
4. **The engine connects.** It opens [[route:GET /ws]] with `Authorization: Bearer <id>:<secret>`, which [[server:caller]] reads as it reads a browser's player cookie. The session sends it the table as its player may see it; with a full view, [[server:TableSession|TableSession.viewFor]] gives it [[core:fullView]], every hand and face-down card included.
5. **It follows the table and asks players.** Besides what any player may send, an engine sends [[message:follow]], [[message:ask]] and [[message:cancel-prompt]]. [[server:EngineLink]] handles them: following streams the [[server:EventFeed]] as [[message:events]] messages, asking goes through the same board as the agent's prompts and is answered with [[message:asked]]. An engine without a full view hears only the answers to its own prompts, since answers name pieces by their real ids. It moves pieces with ordinary [[message:command]] messages.
6. **The host can send it away.** In the players list the host has a button that calls [[route:DELETE /api/engines/:id]]. [[server:Workspace|Workspace.dismissEngine]] forgets the engine, so its secret stops working, and the route closes its connections ([[server/routes/context.ts]]).

## Roles

- [[server/play/knocks.ts]] decides who may knock and turns the host's answer into a player; [[server/play/players.ts]] keeps engines with the other players.
- [[server/play/engines.ts]] is the engine's side of the socket; the browser's side is unchanged.
- [[core/views/protocol.ts]] defines the messages, so an engine in any language can speak them.
- [[engine-client]] is the client engines in JavaScript or TypeScript use, published as `trayful/engine`. It spells the messages out again in [[engine-client/protocol.ts]], so it needs no other package; a test keeps the two the same.
