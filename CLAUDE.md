# Working on Trayful with Claude

The README's Development section describes the commands, the package layout and the code quality limits. This file covers what Claude sessions do on top of that.

## Before opening a pull request, or pushing to one

1. Run `pnpm check` and fix everything it reports. Never add entries to `eslint-suppressions.json`. When your change fixes baselined violations, run `pnpm lint:prune` and commit the smaller file.
2. Review your own diff (`git diff origin/main...`) against [REVIEW.md](REVIEW.md). Read it as a reviewer seeing the code for the first time, not as its author.
3. Fix every **Blocking** and **Should fix** finding before pushing. Fix **Nits** when they are cheap. If you decide to leave a finding, say why in the PR description.

This local review is the only review Claude does. Never review, comment on or reply to comments on a pull request on GitHub.
