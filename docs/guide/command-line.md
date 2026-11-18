# Command line

| Command                                   | What it does                                                          |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `trayful new <folder> [--name <name>]`    | A new project from the starter template                               |
| `trayful play [folder]`                   | Open the table in your browser; see [its options](playing.md#options) |
| `trayful mcp [folder]`                    | MCP server on stdio, for agents                                       |
| `trayful validate <project-dir> [--json]` | Check a project and report problems with file, line and column        |
| `trayful migrate <project-dir>`           | Rewrite a `trayful/1` project in the current file format              |
| `trayful skill [repo-dir]`                | Add the agent skill to a repository, for Claude Code                  |

Run them as `npx trayful …`, or as `pnpm trayful …` from a clone of this repository. See the [CLI README](../../packages/cli/README.md) for every option.

`play` and `mcp` take a project's folder or a folder of projects. Either way Trayful serves the folder of projects: started on `my-game`, it serves the folder `my-game` is in and opens `my-game` first, so the table menu also lists the games beside it and **New project…** adds one there. The first time it serves a folder that holds other files too, such as your home folder, it asks first; `--yes` answers for it. Trayful keeps its own files, such as the players who joined, in `.trayful/` in that folder, which leaves itself out of git.
