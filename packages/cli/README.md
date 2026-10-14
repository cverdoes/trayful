# trayful (CLI)

The `trayful` command line. From the repo root:

```sh
pnpm trayful new ../my-game --name "My Game"         # a new project from the starter template
pnpm trayful play examples/harvest-moon              # open the table in your browser
pnpm trayful play examples                           # a folder of projects, switchable in the browser
pnpm trayful play examples/harvest-moon --tunnel     # with an invite link for playtesters anywhere
pnpm trayful mcp examples/harvest-moon               # MCP server on stdio, for agents
pnpm trayful validate examples/harvest-moon          # human-readable report
pnpm trayful validate examples/harvest-moon --json   # for tools and agents
```

`new <folder> [--name <name>]` copies [`examples/starter`](../../examples/starter) into a new folder, names the game and points the editor schema hints at this checkout.

`play [project-dir]` loads the project (default: the current folder), or every project in a folder of projects, starts the local server at http://127.0.0.1:4317 and opens your browser. Project files are watched, so saved changes show up on the table at once. It needs the browser app built once with `pnpm build`. Options:

| Option           | What it does                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `--project <id>` | In a folder of projects, the one to open first (default: the first that loads)                 |
| `--table <name>` | Open or create `tables/<name>.json` (default `table-1`)                                        |
| `--seed <n>`     | Shuffle seed for a new table                                                                   |
| `--setup <name>` | Setup for a new table (default: the manifest's `setup`; `none` lays everything out in rows)    |
| `--port <n>`     | Port for the server (default 4317)                                                             |
| `--no-open`      | Do not open a browser window                                                                   |
| `--share`        | Listen on every network interface and print invite links for others on your network            |
| `--tunnel`       | Open a Cloudflare quick tunnel with `cloudflared` and print an invite link that works anywhere |

`--tunnel` runs `cloudflared tunnel --url http://127.0.0.1:<port>` (from `tunnel.ts`) and reads the `https://….trycloudflare.com` address from its output; set `TRAYFUL_CLOUDFLARED` to run another program instead, as the tests do. Without `cloudflared` installed it says where to get it.

`mcp [project-dir]` takes the same options, apart from `--share` and `--tunnel`. It speaks MCP on stdin and stdout. If `trayful play` already serves the project (or the folder of projects) on that port, it relays to that server; otherwise it opens the table itself, so people can watch at the printed address. Messages for people go to stderr.

`bin/trayful.js` runs the CLI from source without `pnpm`, for MCP client configs: `node /path/to/trayful/packages/cli/bin/trayful.js mcp /path/to/project`.

With `TRAYFUL_SMOKE_TEST=1` set, `play` starts, checks that the app is served, and exits; CI uses this.

Exit codes: `0` success, `1` the project has errors (or the server could not start), `2` wrong usage.

Test with `pnpm vitest run packages/cli` from the repo root.
