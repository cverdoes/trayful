---
title: Code quality
kind: contributing
order: 2
summary: The limits CI enforces, how coverage floors rise, and how drawing speed is guarded.
---

CI enforces limits a person would otherwise have to police in review. ESLint checks complexity (cognitive complexity 15, nesting depth 4, at most 4 parameters, functions up to 80 lines, files up to 400) and common code smells. `.dependency-cruiser.cjs` keeps packages layered (formats, then core, then server and app, then cli; the engine client stands alone) and core and the app free of Node built-ins. Knip finds unused files, exports and dependencies, and jscpd finds copy-pasted code. Unit test coverage must not drop below each package's floor in `vitest.config.ts`. The app's React components (`.tsx`) are left out of the coverage report, because the e2e suite covers them; the app's floor guards its plain modules.

The e2e suite also guards drawing speed: `e2e/performance.spec.ts` times a full redraw of the Harvest Moon table on a Retina-sized canvas, fitted and zoomed in, and fails above a budget. The table redraws on every step of a drag, pan or zoom, so a slow redraw is what makes it feel sluggish. When it fails, find what made drawing slower (heavy SVG filters, wide shadows) rather than raising the budget.

Every file meets these limits, so a violation fails the build; fix the code rather than switching a rule off. When your tests raise a package's coverage, `pnpm test:coverage` raises its floor in `vitest.config.ts` to 2 points under the new number; commit that change with your tests.

Each CI run's summary page shows the number of unit tests and the coverage of each package next to its floor, the most complex functions, duplication, and the number of browser tests in each e2e spec file. The HTML coverage report is attached to the run as `coverage-report`.

Claude sessions also review their own changes against [REVIEW.md](https://github.com/cverdoes/trayful/blob/main/REVIEW.md) for readability, naming and design, locally, before opening a pull request. There is no review on the pull request itself.
