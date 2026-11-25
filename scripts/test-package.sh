#!/usr/bin/env bash
# Installs a packed trayful tarball in an empty folder and runs it the way a user
# would: `npx trayful --version`, `new`, `skill`, importing `trayful/engine`, an
# extension built on `trayful/server`, `play` and an MCP handshake.
# Usage: scripts/test-package.sh path/to/trayful-x.y.z.tgz
set -euo pipefail

tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
# npm on Windows needs C:/… rather than Git Bash's /c/… paths.
if command -v cygpath > /dev/null; then tarball="$(cygpath -m "$tarball")"; fi
examples="$(cd "$(dirname "${BASH_SOURCE[0]}")/../examples" && pwd)"
work="$(mktemp -d)"
cd "$work"
npm init -y > /dev/null
npm pkg set type=module
npm install --no-audit --no-fund "$tarball"

version="$(npx trayful --version)"
echo "trayful --version: $version"
test "$version" = "$(node -p 'require("./node_modules/trayful/package.json").version')"

npx trayful new my-game
grep -q "cdn.jsdelivr.net/npm/trayful@$version/resources/schemas" my-game/trayful.yaml

npx trayful skill
grep -q "^name: trayful$" .claude/skills/trayful/SKILL.md

# Engines import the client from the package, with its type declarations beside it.
node --input-type=module -e "
  import { knock, KnockRefused, TableConnection } from 'trayful/engine';
  if (typeof knock !== 'function' || typeof TableConnection.open !== 'function' || !KnockRefused) process.exit(1);
"
test -f node_modules/trayful/engine/index.d.ts

# Extensions import the server from the package: the example extension, type-checked
# against the published declarations, caps a folder of projects at one.
cp "$examples/extension/extension.ts" .
npm install --no-audit --no-fund --no-save typescript@~6.0 @types/node@22 fastify@5 zod@4
npx tsc --strict --noEmit --skipLibCheck false --module nodenext --target es2023 \
  --types node extension.ts
node --input-type=module -e "
  import { LimitError, startServer } from 'trayful/server';
  import { projectCap } from './extension.ts';
  const server = await startServer({ projectDir: '.', port: 0, watch: false, extensions: [projectCap(1)] });
  const reply = await server.app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Second' } });
  await server.close();
  if (reply.statusCode !== 403 || !LimitError) process.exit(1);
"

# Checks that the table starts and serves the app, then exits.
TRAYFUL_SMOKE_TEST=1 npx trayful play my-game --no-open

# The MCP server answers an initialize request on stdin and exits when stdin closes.
initialize='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"ci","version":"1"}}}'
reply="$(printf '%s\n' "$initialize" | npx trayful mcp my-game)"
echo "MCP: $reply"
echo "$reply" | grep -q '"serverInfo":{"name":"trayful","version":"'"$version"'"'
echo "The package works."
