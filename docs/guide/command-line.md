# Command line

| Command                                   | What it does                                                          |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `trayful new <folder> [--name <name>]`    | A new project from the starter template                               |
| `trayful play [project-dir]`              | Open the table in your browser; see [its options](playing.md#options) |
| `trayful mcp [project-dir]`               | MCP server on stdio, for agents                                       |
| `trayful validate <project-dir> [--json]` | Check a project and report problems with file, line and column        |
| `trayful migrate <project-dir>`           | Rewrite a `trayful/1` project in the current file format              |
| `trayful skill [repo-dir]`                | Add the agent skill to a repository, for Claude Code                  |

Run them as `npx trayful …`, or as `pnpm trayful …` from a clone of this repository. See the [CLI README](../../packages/cli/README.md) for every option.
