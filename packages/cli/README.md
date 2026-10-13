# trayful (CLI)

The `trayful` command line. From the repo root:

```sh
pnpm trayful play examples/harvest-moon              # open the table in your browser
pnpm trayful mcp examples/harvest-moon               # MCP server on stdio, for agents
pnpm trayful validate examples/harvest-moon          # human-readable report
pnpm trayful validate examples/harvest-moon --json   # for tools and agents
```

`play [project-dir]` loads the project (default: the current folder), starts the local server at http://127.0.0.1:4317 and opens your browser. It needs the browser app built once with `pnpm build`. Options:

| Option           | What it does                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `--table <name>` | Open or create `tables/<name>.json` (default `table-1`)                                     |
| `--seed <n>`     | Shuffle seed for a new table                                                                |
| `--setup <name>` | Setup for a new table (default: the manifest's `setup`; `none` lays everything out in rows) |
| `--port <n>`     | Port for the server (default 4317)                                                          |
| `--no-open`      | Do not open a browser window                                                                |

`mcp [project-dir]` takes the same options. It speaks MCP on stdin and stdout. If `trayful play` already has the project open on that port, it relays to that table; otherwise it opens the table itself, so people can watch at the printed address. Messages for people go to stderr.

`bin/trayful.js` runs the CLI from source without `pnpm`, for MCP client configs: `node /path/to/trayful/packages/cli/bin/trayful.js mcp /path/to/project`.

With `TRAYFUL_SMOKE_TEST=1` set, `play` starts, checks that the app is served, and exits; CI uses this.

Exit codes: `0` success, `1` the project has errors (or the server could not start), `2` wrong usage.

Test with `pnpm vitest run packages/cli` from the repo root.
