---
title: How we work
kind: onboarding
order: 5
summary: Where things live, the checks a change must pass, and what to update along with the code.
---

The README's Contributing section has the commands. This page says how they fit together.

## Where things live

| Path                   | What it holds                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `packages/<name>/src`  | The code, in sub folders that follow the layers (each package has a page here).                    |
| `packages/<name>/test` | Unit tests, in the same folders as the code they test.                                             |
| `e2e/`                 | Browser tests: a real server, a real Chromium, and two players or an agent where it matters.       |
| `examples/`            | Projects that are validated in CI and used by tests and guides. Harvest Moon uses every file kind. |
| `docs/`                | For game designers: HOWTO guides and the format reference. Ships in the npm package and over MCP.  |
| `architecture/`        | These pages, for people working on the code. Not shipped.                                          |
| `skills/trayful/`      | The agent skill `trayful skill` installs into a game's repository.                                 |
| `scripts/`             | Code generation, example validation, packaging, CI summaries and this overview.                    |

## The checks

`pnpm check` runs everything CI runs: lint and formatting, type checks, unit tests with coverage, generated files, the examples, this overview's `--check`, and `pnpm quality` (layers, unused code, duplication). CI also runs the e2e suite, the README's quick start on a clean checkout, the Docker image, and the npm package on Linux, macOS and Windows. A separate Audit workflow fails on any high or critical advisory.

The limits are fixed (see [[concept:decisions]], entry 14): cognitive complexity 15, nesting depth 4, at most 4 parameters, 80 lines per function, 400 lines per file, and a coverage floor per package that rises as tests are added. Fix the code; never switch a rule off.

## Testing

- **Core logic** gets unit tests in [[core]]: commands, placement, views. Most behaviour can be shown there without a browser.
- **The server** is tested with real sessions, real WebSockets and a real MCP client against example projects.
- **The app's** plain modules have unit tests; its React components are covered by the e2e suite instead and left out of the coverage report.
- **Flows** a person sees (drag a card, invite a friend, design a component) get an e2e test.

## What to change along with the code

| When you change              | Also change                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- |
| A schema                     | Run `pnpm generate`, update an example, and commit the generated files.         |
| A command, setup step or CLI | The README, in the same change.                                                 |
| What a HOWTO guide shows     | The guide; `scripts/test/docs.test.ts` checks quoted files and links.           |
| An MCP tool                  | The agent skill in `skills/trayful/`; its test fails otherwise.                 |
| Something these pages name   | The page; `pnpm docs:overview --check` fails on a broken symbol link.           |
| A dependency                 | Its reason on [[concept:technology]]; the check fails on an unexplained one.    |
| A release                    | `CHANGELOG.md` and the version in `packages/cli/package.json`, then a `v*` tag. |

## Branches, pull requests and releases

Work happens on branches and lands on `main` through pull requests once CI is green. Dependabot opens weekly updates for npm packages, GitHub Actions and the Docker base image. Pushing a `v*` tag runs the Release workflow, which tests the package and publishes it to npm with trusted publishing, so no npm token is stored anywhere. The Pages workflow publishes this overview from `main`.

Changes made by Claude sessions follow `CLAUDE.md`: run `pnpm check`, review the diff against `REVIEW.md` locally before opening a pull request, and never review or comment on pull requests on GitHub.

## Where to go next

Follow an interaction from the home page, such as [[concept:drag-onto-a-row]], and open the modules it names. The [[concept:glossary]] has the words the code uses.
