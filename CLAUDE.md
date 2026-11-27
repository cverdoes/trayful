# Working on Trayful with Claude

This file is for Claude sessions, wherever they run. The pages in [`architecture/`](architecture/README.md) explain the code; read the ones that touch your change before you start:

- [Develop Trayful](architecture/develop.md): commands, repository layout, generated files.
- [Code quality](architecture/code-quality.md) and [How we work](architecture/how-we-work.md): the limits CI enforces, where tests go, and what to update along with the code.
- [The decisions behind the shape](architecture/decisions.md): why Trayful is built the way it is. Changing one of these is a question for the maintainer, not a refactoring.
- [What Trayful is, and is not](architecture/scope.md), [Extending the server](architecture/extending.md), [Releasing](architecture/releasing.md) and the [glossary](architecture/glossary.md).

What follows is how the maintainer, Claes, wants Claude to work, on top of those pages.

## Working with the maintainer

- Write in English: code, commits, pull requests and chat, even when a message to you is in Swedish.
- Never review, comment on or reply to comments on a pull request on GitHub, and never post a CI failure explanation there either. Report it to Claes in the conversation instead.
- Every pull request description has a **Blast radius** section: a short, high-level summary of what changes in the source code (not tests or docs), and what it could affect, so Claes can judge the impact. Give the same summary when you report the pull request. For a change to docs only, say so.
- Claes tags releases and publishes; Claude never pushes a tag or publishes to npm. A pull request that changes what users get adds a line to the `## Unreleased` section of `CHANGELOG.md` (see [Releasing](architecture/releasing.md)).
- When a choice changes what Trayful is or does for people, ask. When it can be undone after Claes has seen it, such as a branch or a pull request, go ahead and say what you did.

## Before opening a pull request, or pushing to one

1. Run `pnpm check` and fix everything it reports. Fix lint findings in the code; never switch a rule off with an `eslint-disable` comment or a suppressions file.
2. Review your own diff (`git diff origin/main...`) against [REVIEW.md](REVIEW.md). Read it as a reviewer seeing the code for the first time, not as its author.
3. Fix every **Blocking** and **Should fix** finding before pushing. Fix **Nits** when they are cheap. If you decide to leave a finding, say why in the PR description.
4. Read the diff once more for the slips self-review has missed before:
   - A doc comment left on the wrong function, or dropped, after a scripted insert or rewrite.
   - The same problem fixed two different ways in one diff; share one helper.
   - A config override wider than its reason; scope it with `files:`.
   - A cast such as `as Buffer` to quiet a rule, where a small typed helper would do.
   - One expression split into tiny helpers that read worse than one helper read top to bottom.

This local review is the only review Claude does.

## Conventions that are easy to miss

- **Local use stays as it is.** Features for a Trayful on a server (owner mode, git-backed projects, extensions) are opt-in. Without their flag or extension, `trayful play` on a designer's computer behaves exactly as before.
- **Docs.** `docs/` is for game designers: the user guide in `docs/guide/`, the HOWTO guides and the format reference. It ships in the npm package and agents read it over MCP. `architecture/` is for contributors and does not ship. Put each change in the half its reader uses.
- **Images for the README and guides** go in `.github/readme/`, never in `docs/`, because everything in `docs/` ships in the npm package.
- **The interface** uses the design tokens in `packages/app/src/tokens.css` and the shared components in `packages/app/src/ui/`; no component library. Colour values live only in `tokens.css` (`pnpm check:colours`). New icons are Lucide, copied in as inline SVG, with the licence in `THIRD_PARTY_NOTICES.md`.
- **Drawing speed.** Complex SVG filters (paper grain, wide blurs) in example art are slow on the canvas. `e2e/performance.spec.ts` has a budget; when it fails, find what made drawing slower rather than raising it. Measure at a device scale factor of 2, not 1.
- **Dependencies.** `@types/node` stays on the oldest supported Node major (22, see `.nvmrc` and `engines`); close updates to a newer major. Exact pins of `eslint-plugin-sonarjs`, `@playwright/test`, `esbuild` and `@modelcontextprotocol/sdk` are deliberate; bumping them is fine when CI passes. Fix an audit advisory by updating the package; ignore one in `pnpm-workspace.yaml` only when no fix exists, with the reason beside it, and take it out once one does.

## Running the browser tests in a cloud container

The container's Chromium may not match the pinned Playwright. Run `pnpm build` first, then point Playwright at the installed browser through `launchOptions.executablePath` (for example `/opt/pw-browsers/chromium`) in a local, uncommitted change to the Playwright config. Artifact downloads from CI may be blocked there; CI prints each failed test's `error-context.md` into its log for that reason.
