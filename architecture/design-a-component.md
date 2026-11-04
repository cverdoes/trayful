---
title: The host changes a component in the designer
kind: interaction
order: 7
summary: How an edit in the browser is written to a YAML file and reaches every open table.
---

The project files stay the source of truth. The designer edits them through the server, which writes the YAML, reloads the project, and brings every open table up to date as one undoable step.

## Steps

1. **The edit.** In design mode ([[app/design/Designer.tsx]]) each change, such as a new size or a face colour, goes through [[app:editDraft]] in the designer's store ([[app/design/store.ts]]), which keeps its own undo history and saves a valid draft by itself ([[app:saveDraft]]).
2. **The save.** [[app:saveType]] in [[app/design/api.ts]] sends the whole type to [[route:PUT /api/types/:id]], with the version (a hash) of the library file it was edited against. The route is host-only.
3. **The YAML is patched, not rewritten.** [[server:upsertType]] in [[server/authoring.ts]] reads the library file, refuses with a conflict if it changed on disk since the editor read it, and patches only the keys that changed with [[server:patchNode]], so comments and layout survive. Saves are queued one at a time per workspace.
4. **Commit or roll back.** [[server:commit]] writes the file and asks the workspace to reload the project. If it no longer loads, it writes the old file back and the designer shows why.
5. **The project reloads.** The workspace runs [[formats:loadProject]] again and hands the new project to each open [[server:TableSession]], whose `setProject` gives the engine the new types and sends browsers a [[message:project]] message, so they redraw with the new faces.
6. **Tables follow the inventory.** [[core:syncTable]] adds new components to the table, removes deleted ones and updates changed ones, as one whole-table step on the history.
7. **Agents use the same path.** MCP tools such as [[mcp:upsert_type]] in [[server/mcp/authoring.ts]] call the same authoring functions, so a change from an agent is checked, written and reloaded in the same way.

Editing a file by hand works too: the workspace watches the project folder and reloads on its own. A file with errors leaves tables on the last good version and sends a [[message:problems]] message instead.

## Roles

- [[server/authoring.ts]] and [[server/yaml-patch.ts]] are the only code that writes project files.
- [[formats]] decides whether the files are valid, for saves and hand edits alike.
- [[core/sync.ts]] decides how a table changes when the files do.
