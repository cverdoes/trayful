---
title: Develop Trayful
kind: contributing
order: 1
summary: Build and run Trayful from a clone, find your way around the repository, and the commands you use every day.
---

## Run it from a clone

You need [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/) 10. If you have Node but not pnpm, run `corepack enable` once.

```sh
git clone https://github.com/cverdoes/trayful.git
cd trayful
```

```sh
pnpm install
pnpm build
pnpm trayful validate examples/harvest-moon
pnpm trayful play examples/harvest-moon
```

`validate` should end with `✓ Harvest Moon: 6 types, 26 components, 1 deck, 1 setup`. `play` starts a local server at http://127.0.0.1:4317 and opens the table in your browser; press Ctrl+C to stop it. The README has the same commands, and CI runs them from there on a clean checkout, so they stay correct.

## Repository layout

Each package keeps its code in `src/` and its unit tests in `test/`, in the same folders as the code they test.

| Path                         | What it is                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `packages/formats`           | File format schemas (Zod), YAML loader and validator, generated JSON Schemas                                      |
| `packages/core`              | Table state, commands, snapping, setups, undo and seeded randomness                                               |
| `packages/server`            | Local server: projects and tables, players and invites, live reload, WebSocket sync, MCP                          |
| `packages/app`               | Browser table (React and Konva)                                                                                   |
| `packages/cli`               | The `trayful` command line                                                                                        |
| `packages/engine-client`     | The client engines use to run a game at a table, published as `trayful/engine`                                    |
| `examples/harvest-moon`      | Sample prototype that uses every file kind; validated in CI                                                       |
| `examples/starter`           | The template `trayful new` copies; validated in CI                                                                |
| `examples/piecepack`         | The public-domain piecepack with Backgammon and Tablut, built to find what Trayful cannot do yet; validated in CI |
| `examples/roll-and-write`    | Six Rows, a small roll-and-write game on score sheets with stamp and text boxes; validated in CI                  |
| `examples/referee`           | An example engine: a referee that runs a buying game at a Harvest Moon table, tested against a real table         |
| `docs`                       | The user guide, the HOWTO guides and the format reference (partly generated); ships in the npm package            |
| `architecture`               | These pages: working on Trayful, onboarding, interaction walkthroughs and concepts                                |
| `skills/trayful`             | The agent skill `trayful skill` installs: how to design and play over MCP; a test keeps it true to the tools      |
| `e2e`                        | Browser tests (Playwright): playing, snapping, agents, authoring, printing, two players                           |
| `scripts`                    | Code generation, example validation and the dev server                                                            |
| `Dockerfile`, `compose.yaml` | Running the server in a container; `scripts/docker.sh` starts it                                                  |

## Commands

| Command                  | What it does                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm dev`               | Table server plus the app with hot reload at http://localhost:5173       |
| `pnpm build`             | Build the browser app (needed before `trayful play`)                     |
| `pnpm package`           | Build the `trayful` npm package in `packages/cli/dist`                   |
| `pnpm test`              | Run all unit tests (Vitest)                                              |
| `pnpm test:e2e`          | Play in a real browser, by hand and as an agent; run `pnpm build` first  |
| `pnpm test:watch`        | Re-run tests on change                                                   |
| `pnpm test:coverage`     | Unit tests with a coverage report in `coverage/`; fails below the floor  |
| `pnpm typecheck`         | Type-check every package                                                 |
| `pnpm lint`              | ESLint (incl. complexity and size limits) and Prettier check             |
| `pnpm quality`           | Package boundaries, unused code and copy-paste duplication               |
| `pnpm quality:summary`   | Test counts, coverage, complexity and duplication as Markdown            |
| `pnpm e2e:summary`       | Browser test counts per spec file as Markdown, after `pnpm test:e2e`     |
| `pnpm format`            | Format everything with Prettier                                          |
| `pnpm generate`          | Regenerate JSON Schemas and the format reference after changing a schema |
| `pnpm validate:examples` | Validate every project in `examples/`                                    |
| `pnpm docs:overview`     | Build this site in `.reports/overview/`; `--open` opens it               |
| `pnpm check`             | Everything CI runs, in one go                                            |

Packages are TypeScript run directly from source (through `tsx` and Vitest). Only the browser app is built, with Vite. `pnpm dev [project-dir]` serves the app with hot reload; it opens `examples/harvest-moon` unless you name another folder. Before `pnpm test:e2e` on a new machine, run `pnpm exec playwright install chromium` once.

When you change a schema in `packages/formats/src/schemas/index.ts`, run `pnpm generate` and commit the regenerated files; CI fails when they are stale. When you change setup steps, scripts or commands, update the user guide in `docs/guide/` and these pages in the same change. When you change what a HOWTO guide describes, update the guide; `scripts/test/docs.test.ts` checks that the files the guides quote still match `examples/`, and that their links work.

## This site

`pnpm docs:overview` builds this site into `.reports/overview/`: open its `index.html` in a browser, no server needed (`pnpm docs:overview --open` does that for you). It has two halves. The **user guide** is the Markdown in `docs/`: the guide, the HOWTO guides and the format reference, the same pages that ship in the npm package and that agents read over MCP. The **contributors** half starts with onboarding pages for an engineer new to the project: what Trayful is and is not, how it runs, the technology and libraries and why each is there, the architectural decisions and what they cost, and how we work. Then it shows the packages in their layers, every module with its purpose, exports and imports, the key types, the table commands, the WebSocket messages, the MCP tools, the HTTP routes and the CLI, all read from the source each time it runs, plus walkthroughs of what happens when someone drags a card, draws into a hand, undoes, joins or designs a component.

The contributor pages are Markdown in `architecture/`. They name code with symbol links in double brackets, such as `core:TableEngine`, instead of paths, and `pnpm docs:overview --check` (part of `pnpm check`) fails when one names something that is gone, when a key type disappears, when a source file has no comment saying what it is for, when a package is in no page, or when a library in a `package.json` has no reason given on [[concept:technology]]. When you rename or move what a page explains, update the page in the same change. CI attaches the site to each run as `architecture-overview`, and the Pages workflow publishes the site of `main` to the repository's GitHub Pages site.
