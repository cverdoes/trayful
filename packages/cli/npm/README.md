# Trayful

A boardgame prototyping table in your browser. Describe your components (cards, boards, meeples, dice, counters) in YAML files, then play with them on a shared table: drag, flip, rotate, stack, shuffle and deal. Invite playtesters over your network or the internet, and let AI agents play or build components over MCP.

Needs [Node.js](https://nodejs.org) 22.12 or newer.

## Start

```sh
npx trayful new my-game      # a new prototype from the starter template
npx trayful play my-game     # open it on a table in your browser
```

Or install it once with `npm install -g trayful` and drop the `npx`.

## Play with others

```sh
npx trayful play my-game --share    # players on your network
npx trayful play my-game --tunnel   # players anywhere (needs cloudflared, no account)
```

Trayful prints invite links when it starts. Anyone with a link can join that table, so share them like keys.

## Let an AI agent join

Add Trayful as an MCP server in Claude Desktop, Claude Code or another MCP client:

```json
{
  "mcpServers": {
    "trayful": { "command": "npx", "args": ["-y", "trayful", "mcp", "/path/to/my-game"] }
  }
}
```

The agent can then see and play the table you have open, and design new components with you.

## More

`npx trayful help` lists every command. Guides and the file format reference are at [github.com/cverdoes/trayful](https://github.com/cverdoes/trayful).

Licensed under the [Functional Source License 1.1, MIT Future License](LICENSE.md): use it for anything, including games you sell, except offering Trayful itself as a competing commercial product or service. Bundled packages are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
