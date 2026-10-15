# Working on Trayful with Claude

The README's Development section describes the commands, the package layout and the code quality limits. This file covers what Claude sessions do on top of that.

## Before opening a pull request, or pushing to one

1. Run `pnpm check` and fix everything it reports. Fix lint findings in the code; never switch a rule off with an `eslint-disable` comment or a suppressions file.
2. Review your own diff (`git diff origin/main...`) against [REVIEW.md](REVIEW.md). Read it as a reviewer seeing the code for the first time, not as its author.
3. Fix every **Blocking** and **Should fix** finding before pushing. Fix **Nits** when they are cheap. If you decide to leave a finding, say why in the PR description.

This local review is the only review Claude does. Never review, comment on or reply to comments on a pull request on GitHub.
