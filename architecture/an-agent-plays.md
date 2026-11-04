---
title: An agent draws a card over MCP
kind: interaction
order: 5
summary: How an AI agent plays the same table as the people, through the same commands.
---

An agent such as Claude Code connects over MCP and calls tools like [[mcp:draw]]. It plays as the player `claude` ([[server:AGENT_PLAYER]]), through exactly the commands a browser sends, so people watch it play and can undo their own moves around it.

## Steps

1. **The connection.** The agent starts [[trayful:mcp]] over stdio ([[cli/mcp.ts]]), which relays to a running `trayful play` if there is one, so people and agent share the table; or it connects over HTTP to [[route:POST /mcp]] ([[server/routes/mcp.ts]]). Either way [[server:createMcpServer]] builds the server and registers the tools, grouped by what they are for: [[server/mcp/reading.ts]], [[server/mcp/play.ts]], [[server/mcp/tables.ts]] and [[server/mcp/authoring.ts]].
2. **The agent looks first.** [[mcp:describe_table]] answers with a text summary of the table from [[core:describeTable]], with the hands and bags of other players left out; [[mcp:snapshot]] asks a watching browser to draw the table as a picture.
3. **The tool becomes a command.** The `draw` tool turns its inputs into a [[command:draw]] command and passes it to the tool context's `play` ([[server/mcp/context.ts]]).
4. **All or nothing.** `play` first tries every command on a copy with [[core:applyCommand]] and checks the agent's reach, so a tool call that sends several commands changes everything or nothing. A refusal comes back to the agent as a tool error with the [[core:CommandError]] text.
5. **The same path as a person.** It then runs the commands through [[server:TableSession|TableSession.asAgent]] and [[core:TableEngine|TableEngine.dispatch]] as player `claude`, labelled "drew a card" for the people watching. From here it is the path in [[concept:drag-onto-a-row]]: the engine applies and records it, and every watcher gets their view.
6. **People see it happen.** The [[message:state]] message carries an [[core:Activity]] marked as the agent's, which the browsers show, with the motion to animate for a roll or a shuffle ([[server:motionOf]]).
7. **The agent gets the result.** The tool answers with the objects that changed, as the agent may see them.

## Roles

- [[server/mcp.ts]] and its tool modules translate between MCP and commands; they hold no game rules.
- [[core]] treats the agent like anyone else; only [[server:TableSession]] knows it is an agent.
- The tool list on [[concept:index|the overview]] is generated from a running server, see [MCP tools](../surfaces/mcp.html).
