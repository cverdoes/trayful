---
title: Start here
kind: concept
order: 0
summary: What Trayful is made of and where to start reading.
---

Trayful is a table for prototyping board games. A project is a folder of YAML files that describe components; the server loads it, keeps one or more tables of it in memory, and every browser and agent at a table sees the same state, each only as much as their player may.

Four ideas carry most of the code:

- **Files are the truth for what exists.** [[formats]] reads a project folder into a [[formats:ResolvedProject]]: its component types, every physical component in the box, and its setups. Nothing else parses YAML.
- **Every change is a command.** A move, a draw or a shuffle is a [[core:Command]], applied by [[core:applyCommand]] to an immutable [[core:TableState]]. The browser, the MCP tools and setups all send the same commands, so they share validation, undo and the history.
- **The server holds the table.** A [[server:TableSession]] owns one table's [[core:TableEngine]], saves it to disk, and sends each watcher a [[core:TableView]]: the table as their player may see it.
- **The browser only draws and asks.** [[app]] renders what the server sends and turns gestures into commands; it never changes the table itself.

The quickest way in is to follow an interaction from the list below, then open the modules it names.
