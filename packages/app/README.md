# @trayful/app

The browser table, built with React, [react-konva](https://konvajs.org/docs/react/) and zustand. It draws components from their library definitions and sends every change to the server as a command, so the server's table is always the truth.

| File                       | What it does                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/connection.ts`        | Loads the project and keeps a WebSocket open, reconnecting if lost                               |
| `src/store.ts`             | App state: the table, selection, viewport                                                        |
| `src/Table.tsx`            | The canvas: dragging, snapping, drawing from piles, stacking, fans and spreads, panning, zooming |
| `src/render/Component.tsx` | Draws one component's face from its layers                                                       |
| `src/actions.ts`           | What the toolbar and keys can do with the selection                                              |
| `src/App.tsx`              | Toolbar, keyboard shortcuts, help, errors and agent activity                                     |
| `src/snapshot.ts`          | Draws the whole table to a PNG when an agent asks for a snapshot                                 |

Units on the canvas are millimetres; the viewport scales them to pixels.

- `pnpm build` (from the repo root) builds into `dist/`, which `trayful play` serves.
- `pnpm dev` (from the repo root) runs a table server and this app with hot reload at http://localhost:5173.

`window.__trayful` exposes the store and a `worldToScreen` helper for the end-to-end tests in [`e2e/`](../../e2e).
