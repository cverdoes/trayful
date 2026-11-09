---
title: A piece goes to another surface
kind: interaction
order: 10
summary: How a table holds several play spaces, and how a move carries a board and what sits on it from one to another.
---

A table can have surfaces besides the Centre, such as one per player. Each is its own plane with its own positions, so a hidden or crowded surface never pushes another around. Sending a player board to their surface shows how the parts keep that straight.

## Steps

1. **The command.** An agent calls the [[mcp:move]] tool with `to: "surface:red"`, which becomes a [[command:move]] command. A position plus `surface` does the same at a chosen spot.
2. **The session checks it.** [[server:TableSession|TableSession.act]] checks reach as for any command; for [[command:sit]] it also checks that only the host and agents seat someone else.
3. **The engine finds room.** [[core:move]] sees the `surface:` target ([[core:surfaceTarget]]) and asks [[core/placement/room.ts]] for free room on that surface only ([[core:roomOn]]), looking at nothing on other surfaces.
4. **The board and its riders move together.** [[core:Transaction|Transaction.relocate]] gives the board its new position and surface, and carries everything snapped onto it. When the command commits, the transaction settles surfaces: anything snapped onto a piece lies on that piece's surface, and pieces in a stack, hand or bag lie on none.
5. **The table is checked.** Saved tables list their surfaces ([[format:table]]), and [[core:checkIntegrity]] refuses an object on an unknown surface or on another surface than the board it sits on.
6. **Undo knows the list.** [[core:TableEngine]] treats the list of surfaces as one thing: a change to it is undone only while nobody else has changed it since.
7. **Agents read it back.** [[core:describeTable]] lists the surfaces with who sits where and says which surface each object lies on; [[mcp:describe_table]] takes a `surface` to describe just one.

## Roles

- [[core/table/surfaces.ts]] answers which surfaces a table has and what lies on each.
- [[core/commands/surfaces.ts]] adds, changes and removes surfaces and seats players.
- [[core/placement/snap.ts]] offers drop areas per surface, so a drop never snaps to a board on another surface.
- [[app/table/surfaces.ts]] decides which surfaces a viewer shows and lays out their tiles; [[app/table/Table.tsx]] gives each tile a canvas of its own, so the board arrives on the `red` tile, drawn at that surface's own pan and zoom.
- [[app/store.ts]] makes the `red` chip pulse when its tile is off and someone else changed what lies there.
