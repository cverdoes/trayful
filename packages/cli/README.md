# trayful (CLI)

The `trayful` command line. For now it validates project folders; from Milestone 1 it also starts the local table server.

From the repo root:

```sh
pnpm trayful validate examples/harvest-moon          # human-readable report
pnpm trayful validate examples/harvest-moon --json   # for tools and agents
```

Exit codes: `0` valid, `1` the project has errors, `2` wrong usage.

Test with `pnpm vitest run packages/cli` from the repo root.
