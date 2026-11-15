---
title: Releasing
kind: contributing
order: 3
summary: Publishing a version to npm from a tag, and keeping dependencies current.
---

A version is published to npm by pushing a tag. Set the new version in `packages/cli/package.json`, add a section for it to [CHANGELOG.md](https://github.com/cverdoes/trayful/blob/main/CHANGELOG.md), merge that to `main`, then tag the merge commit:

```sh
git tag v0.2.0 && git push origin v0.2.0
```

The Release workflow (`.github/workflows/release.yml`) builds the package, checks that the tag matches the version, runs `scripts/test-package.sh` on it, publishes it to npm and makes a GitHub release with the tarball and the version's CHANGELOG.md section as its notes (`scripts/release-notes.sh`; the workflow stops before publishing if the section is missing). A version with a suffix, such as `0.2.0-rc.1`, goes to the `next` tag, so `npx trayful` keeps the last full release and `npx trayful@next` tries the new one. npm accepts the upload through [trusted publishing](https://docs.npmjs.com/trusted-publishers): the package's settings on npmjs.com name this repository, `release.yml` and the GitHub environment `npm`, so no npm token is stored anywhere.

## Dependencies

Dependabot opens weekly pull requests for npm packages, GitHub Actions and the Docker base image (`.github/dependabot.yml`). The Audit workflow runs `pnpm audit` on every push and pull request and each Monday, and fails on any high or critical advisory; fix it by updating or replacing the package, not by ignoring the advisory.
