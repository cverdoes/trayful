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
pnpm trayful migrate ../old-game                     # rewrite a trayful/1 project in trayful/2
```

`new <folder> [--name <name>]` copies [`examples/starter`](../../examples/starter) into a new folder, names the game and points the editor schema hints at this checkout (or, from the npm package, at that release's schemas on jsDelivr).

`play [project-dir]` loads the project (default: the current folder), or every project in a folder of projects, starts the local server at http://127.0.0.1:4317 and opens your browser. Project files are watched, so saved changes show up on the table at once. It needs the browser app built once with `pnpm build`. Options:

| Option           | What it does                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `--project <id>` | In a folder of projects, the one to open first (default: the first that loads)                                     |
| `--table <name>` | Open or create `tables/<name>.json` (default `table-1`)                                                            |
| `--seed <n>`     | Shuffle seed for a new table                                                                                       |
| `--setup <name>` | Setup for a new table (default: the manifest's `setup`; `none` lays everything out in rows)                        |
| `--port <n>`     | Port for the server (default 4317)                                                                                 |
| `--no-open`      | Do not open a browser window                                                                                       |
| `--share`        | Listen on every network interface and print invite links to the opened table for others on your network            |
| `--tunnel`       | Open a Cloudflare quick tunnel with `cloudflared` and print an invite link to the opened table that works anywhere |
| `--container`    | Run inside a container: listen on every interface, count the computer running it as the host, and open no browser  |

`--tunnel` runs `cloudflared tunnel --url http://127.0.0.1:<port>` (from `tunnel.ts`) and reads the `https://….trycloudflare.com` address from its output; set `TRAYFUL_CLOUDFLARED` to run another program instead, as the tests do. Without `cloudflared` installed it says where to get it.

`mcp [project-dir]` takes the same options, apart from `--share`, `--tunnel` and `--container`. It speaks MCP on stdin and stdout. If `trayful play` already serves the project (or the folder of projects) on that port, it relays to that server; otherwise it opens the table itself, so people can watch at the printed address. Messages for people go to stderr.

`migrate <project-dir>` rewrites a project in the first file format, `trayful/1`, in the current one, `trayful/2`, and lists the files it wrote (`migrateFolder` in the server package). Libraries are written afresh, keeping the comment lines at their top; images and palette colours move to a new `assets.yaml`; inventory entries name their `component` instead of their `type`; and setup steps that place a board get `lock: true`. The manifest, inventory and setups are edited in place, so their comments stay. It exits with `1` for a project that is already current or has errors, and changes nothing then. See [Versioning](../../docs/reference/versioning.md#moving-a-project-to-trayful2).

`bin/trayful.js` runs the CLI from source without `pnpm`, for MCP client configs: `node /path/to/trayful/packages/cli/bin/trayful.js mcp /path/to/project`.

`--version` prints the version from this package's `package.json`.

## The npm package

`pnpm package` (from the repo root) builds the published `trayful` package in `dist/`, with `scripts/package.ts`:

- `trayful.mjs`: the CLI, server, core and formats bundled into one file with esbuild, so the package has no dependencies to install.
- `trayful.js`: the `trayful` command. It checks for Node.js 22.12 or newer, then loads the bundle.
- `resources/`: the built browser app, the starter project, the JSON Schemas and the docs, where the server's `resourceDir` looks for them.
- `package.json` (generated, with this package's version), `README.md` (from [`npm/README.md`](npm/README.md), the npm page), `LICENSE.md` and `THIRD_PARTY_LICENSES.md` (the licence of every package bundled into the CLI or the browser app).

Try it the way a user would: `cd packages/cli/dist && npm pack`, then `npm install` the tarball in an empty folder and run `npx trayful play`.

With `TRAYFUL_SMOKE_TEST=1` set, `play` starts, checks that the app is served, and exits; CI uses this.

Exit codes: `0` success, `1` the project has errors (or the server could not start, or there is nothing to migrate), `2` wrong usage.

Test with `pnpm vitest run packages/cli` from the repo root.
