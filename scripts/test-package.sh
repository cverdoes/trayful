#!/usr/bin/env bash
# Installs a packed trayful tarball in an empty folder and runs it the way a user
# would: `npx trayful --version`, `new`, `play` and an MCP handshake.
# Usage: scripts/test-package.sh path/to/trayful-x.y.z.tgz
set -euo pipefail

tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
# npm on Windows needs C:/… rather than Git Bash's /c/… paths.
if command -v cygpath > /dev/null; then tarball="$(cygpath -m "$tarball")"; fi
work="$(mktemp -d)"
cd "$work"
npm init -y > /dev/null
npm install --no-audit --no-fund "$tarball"

version="$(npx trayful --version)"
echo "trayful --version: $version"
test "$version" = "$(node -p 'require("./node_modules/trayful/package.json").version')"

npx trayful new my-game
grep -q "cdn.jsdelivr.net/npm/trayful@$version/resources/schemas" my-game/trayful.yaml

# Checks that the table starts and serves the app, then exits.
TRAYFUL_SMOKE_TEST=1 npx trayful play my-game --no-open

# The MCP server answers an initialize request on stdin and exits when stdin closes.
initialize='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"1"}}}'
reply="$(printf '%s\n' "$initialize" | npx trayful mcp my-game)"
echo "MCP: $reply"
echo "$reply" | grep -q '"serverInfo":{"name":"trayful","version":"'"$version"'"'
echo "The package works."
