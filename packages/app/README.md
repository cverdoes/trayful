# @trayful/app

The browser table, built with React, [react-konva](https://konvajs.org/docs/react/) and zustand. It draws components from their library definitions and sends every change to the server as a command, so the server's table is always the truth.

| File                       | What it does                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/connection.ts`        | Finds out who this browser plays as, then loads the project and keeps a WebSocket open           |
| `src/store.ts`             | App state: the table as this player sees it, players, selection, viewport                        |
| `src/Players.tsx`          | Join screen, player list, invite dialog, and the hand tray along the bottom of the screen        |
| `src/Table.tsx`            | The canvas: dragging, snapping, drawing from piles, stacking, fans and spreads, panning, zooming |
| `src/render/Component.tsx` | Draws one component's face from its layers                                                       |
| `src/actions.ts`           | What the toolbar and keys can do with the selection                                              |
| `src/App.tsx`              | Toolbar, table menu, keyboard shortcuts, help, errors, project problems and who did what         |
| `src/route.ts`             | Which project and table the page shows, from `?project=…&table=…`                                |
| `src/Print.tsx`            | Print-and-play sheets (`?print`): every component at real size on A4, backs mirrored             |
| `src/render/Preview.tsx`   | Draws one component type off screen when an agent asks for `render_component`                    |
| `src/snapshot.ts`          | Draws the whole table to a PNG when an agent asks for a snapshot                                 |

The server sends each browser only what its player may see: face-down cards under stand-in ids, and other players' hands as counts. Dragging onto the hand tray sends a move to `hand:<me>`; dragging a card out of it is an HTML drag that the canvas turns into a move to a position, snap spot or pile.

Units on the canvas are millimetres; the viewport scales them to pixels. When the project files change, the server sends the new project and the app redraws; images are reloaded too.

- `pnpm build` (from the repo root) builds into `dist/`, which `trayful play` serves.
- `pnpm dev` (from the repo root) runs a table server and this app with hot reload at http://localhost:5173.

`window.__trayful` exposes the store and a `worldToScreen` helper for the end-to-end tests in [`e2e/`](../../e2e).
