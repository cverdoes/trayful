# @trayful/app

The browser table, built with React, [react-konva](https://konvajs.org/docs/react/) and zustand. It draws components from their library definitions and the project's assets, and sends every change to the server as a command, so the server's table is always the truth.

| File                       | What it does                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/connection.ts`        | Finds out who this browser plays as, then loads the project and keeps a WebSocket open                                                                                                                    |
| `src/store.ts`             | App state: the table as this player sees it, players, selection, viewport                                                                                                                                 |
| `src/App.tsx`              | Picks the screen: joining, the table with its toolbar and overlays, or print sheets                                                                                                                       |
| `src/Toolbar.tsx`          | The toolbar: undo and redo, what can be done with the selection, fit, print, invite and help                                                                                                              |
| `src/TableMenu.tsx`        | Switches tables and projects, and makes, copies and deletes tables                                                                                                                                        |
| `src/actions.ts`           | What the toolbar and keys can do with the selection                                                                                                                                                       |
| `src/keyboard.ts`          | Keyboard shortcuts                                                                                                                                                                                        |
| `src/Table.tsx`            | The canvas: objects, panning, zooming, box selection and cards played from the hand                                                                                                                       |
| `src/TableObjects.tsx`     | Pieces and stacks on the canvas (piles, fans and spreads), and the drop area hints                                                                                                                        |
| `src/drag.ts`              | Dragging objects and drawing cards off stacks, with snap hints while dragging                                                                                                                             |
| `src/drops.ts`             | What a drop does: snap, stack, move, draw or play from the hand, as commands                                                                                                                              |
| `src/viewport.ts`          | Zoom and pan: fitting the table, zooming at a point, screen to table coordinates                                                                                                                          |
| `src/Players.tsx`          | Join screen, player list and the hand tray along the bottom of the screen                                                                                                                                 |
| `src/hand.ts`              | Who this browser plays as, and where the hand tray is                                                                                                                                                     |
| `src/bags.ts`              | Bags on the table and how many pieces each holds; clicking a bag's count draws one into your hand                                                                                                         |
| `src/Invite.tsx`           | The invite dialog: links to a chosen table, or new ones                                                                                                                                                   |
| `src/Notices.tsx`          | Errors, project problems and who did what                                                                                                                                                                 |
| `src/Help.tsx`             | The help dialog with the mouse and keyboard controls                                                                                                                                                      |
| `src/render/Component.tsx` | Draws one side of a component from its drawing (`drawingOf` in formats): image, tiles, layers, labels                                                                                                     |
| `src/render/face.ts`       | Where text and images go on a face, and which part of an image a tile is                                                                                                                                  |
| `src/design/`              | The designer (`?design`): the component list, a preview to drag on, the step-by-step panel (`Inspector.tsx`), the new-component steps and the Assets page (`&assets`) for images, their tiles and colours |
| `src/route.ts`             | Which project and table the page shows, from `?project=…&table=…`, and the designer's page                                                                                                                |
| `src/Print.tsx`            | Print-and-play sheets (`?print`): every component at real size on A4, backs mirrored                                                                                                                      |
| `src/render/Preview.tsx`   | Draws one component off screen when an agent asks for `render_component`                                                                                                                                  |
| `src/snapshot.ts`          | Draws the whole table to a PNG when an agent asks for a snapshot                                                                                                                                          |

The server sends each browser only what its player may see: face-down cards under stand-in ids, and other players' hands as counts. Dragging onto the hand tray sends a move to `hand:<me>`; dragging a card out of it is an HTML drag that the canvas turns into a move to a position, a spot of a drop area or a pile.

Units on the canvas are millimetres; the viewport scales them to pixels. When the project files change, the server sends the new project and the app redraws; images are reloaded too.

- `pnpm build` (from the repo root) builds into `dist/`, which `trayful play` serves.
- `pnpm dev` (from the repo root) runs a table server and this app with hot reload at http://localhost:5173.

The plain modules (`actions.ts`, `drops.ts`, `keyboard.ts`, `viewport.ts`, `store.ts`, `tables.ts` and `render/face.ts`) have unit tests, which play on the Harvest Moon example through `src/testing.ts`; the components are covered by the end-to-end tests. `window.__trayful` exposes the store and a `worldToScreen` helper for the end-to-end tests in [`e2e/`](../../e2e).
