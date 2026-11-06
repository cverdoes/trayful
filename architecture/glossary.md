---
title: Glossary
kind: concept
order: 90
summary: The words the code and these pages use, and where each lives.
---

| Word                 | Meaning                                                                                                                        | In the code                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Project              | A folder with a `trayful.yaml` manifest, its libraries, inventory, assets and setups.                                          | [[formats:ResolvedProject]], [[format:manifest]]                           |
| Workspace            | The folder the server was started on: one project, or a folder of projects.                                                    | [[server:Workspace]]                                                       |
| Component type       | A kind of component: its size, its faces and the behaviours it has, such as `flippable` or `stackable`.                        | [[formats:ResolvedType]], [[format:library]]                               |
| Inventory, the box   | How many of each component there are. Each copy gets a stable id.                                                              | [[formats:ComponentSpec]], [[format:inventory]]                            |
| Tray                 | The designer's page for the inventory.                                                                                         | [[app/design/tray/TrayPage.tsx]], [[server/projects/tray.ts]]              |
| Table                | One game in progress: where every piece lies. A project can have many, saved in `tables/`.                                     | [[core:TableState]], [[server:TableSession]]                               |
| Piece                | One component on the table, in a stack, in a hand or in a bag.                                                                 | [[core:Piece]]                                                             |
| Stack                | A pile, fan or spread of pieces, such as a deck.                                                                               | [[core:Stack]], [[core:StackLayout]]                                       |
| Command              | One change to a table, such as `move` or `shuffle`.                                                                            | [[core:Command]], [[concept:drag-onto-a-row\|how one flows]]               |
| Drop area, snap spot | A place on a piece where others land: a spot, a pile, a row, a group, a free area or a bag.                                    | [[core:SnapSpot]], [[core/placement/snap.ts]], [[core/commands/settle.ts]] |
| Setup                | Steps that lay out a new table, run through the same commands as play.                                                         | [[core:createTable]], [[format:setup]]                                     |
| Hand                 | A player's private pieces, named `hand:<player>` as a target.                                                                  | [[core:handOf]], [[concept:draw-into-a-hand]]                              |
| Bag                  | A drop area whose contents nobody sees; drawing from it is random.                                                             | [[core/commands/settle.ts]], [[core:bagCounts]]                            |
| View                 | The table as one player may see it: other hands and bags counted, face-down faces hidden.                                      | [[core:TableView]], [[core:viewFor]]                                       |
| Stand-in id          | The id a hidden piece gets in a view, so its id does not give it away.                                                         | [[core:Aliases]], [[core:resolveAliases]]                                  |
| Player               | Someone at the table: the host, an invited guest, or the agent `claude`.                                                       | [[server:Players]], [[server:AGENT_PLAYER]]                                |
| Invite               | A link that lets a guest join one table.                                                                                       | [[server:Invite]], [[concept:join-by-invite]]                              |
| Activity             | Who did what, sent with a change so others can follow along, with the motion to animate.                                       | [[core:Activity]], [[server/play/activity.ts]]                             |
| Player prompt        | A message, yes or no question or choice that an agent shows some players, answered in a panel above the hand. Not table state. | [[core:PlayerPrompt]], [[concept:ask-a-player]]                            |
| Event feed           | The numbered list of what happens at a table, for whatever runs the game to follow.                                            | [[server:EventFeed]], [[mcp:wait_for_events]]                              |
| Stamp, mark          | A roll-and-write mark pressed or written onto a sheet.                                                                         | [[command:mark]], [[core/commands/marks.ts]]                               |
| Designer             | The browser pages for editing component types, the Tray and assets.                                                            | [[app/design/Designer.tsx]], [[concept:design-a-component]]                |
