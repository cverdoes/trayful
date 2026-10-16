import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, DEFAULT_PORT, startServer } from '@trayful/server';
import { CliError } from './errors.js';
import type { PlayOptions } from './options.js';

/** Where the MCP messages come in and go out. Default: this process's stdin and stdout. */
export interface Stdio {
  stdin: Readable;
  stdout: Writable;
}

/**
 * `trayful mcp`: an MCP server on stdin and stdout, for clients such as Claude
 * Code or Claude Desktop. If `trayful play` already has the project open, it
 * relays to that table so people and the agent share it; otherwise it opens the
 * table itself, and people can watch it in a browser.
 *
 * stdout carries the protocol, so every message for people goes to `err`.
 */
export async function mcp(
  options: Omit<PlayOptions, 'open' | 'share' | 'tunnel' | 'container'>,
  err: (s: string) => void,
  io: Stdio = { stdin: process.stdin, stdout: process.stdout },
): Promise<number> {
  const port = options.port ?? DEFAULT_PORT;
  const projectDir = path.resolve(options.dir);
  const running = await health(port);

  if (running) {
    const same = running.projectDir === projectDir || running.root === projectDir;
    if (!same || (options.table && options.table !== running.table)) {
      throw new CliError(
        `Port ${port} already has "${running.project}" (table ${running.table}) open. ` +
          'Stop it, or give this table another port with --port <n>.',
      );
    }
    err(`Connecting to the open table at http://127.0.0.1:${port}`);
    return relay(`http://127.0.0.1:${port}/mcp`, io);
  }

  const server = await startServer({
    projectDir,
    project: options.project,
    table: options.table,
    port,
    seed: options.seed,
    setup: options.setup,
  });
  err(`${server.session.project.manifest.name}: watch the table at ${server.url}`);
  const stdio = new StdioServerTransport(io.stdin, io.stdout);
  const closed = new Promise<void>((resolve) => (stdio.onclose = resolve));
  await createMcpServer(server.workspace, { url: server.url }).connect(stdio);
  io.stdin.once('end', () => void stdio.close());
  await closed;
  await server.close();
  return 0;
}

async function health(
  port: number,
): Promise<{ project: string; projectDir: string; root?: string; table: string } | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok
      ? ((await response.json()) as Awaited<ReturnType<typeof health>>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Passes MCP messages between stdio and a running Trayful server. */
async function relay(url: string, io: Stdio): Promise<number> {
  const stdio = new StdioServerTransport(io.stdin, io.stdout);
  const http = new StreamableHTTPClientTransport(new URL(url));
  const closed = new Promise<void>((resolve) => (stdio.onclose = resolve));
  stdio.onmessage = (message) => void http.send(message).catch(() => void stdio.close());
  http.onmessage = (message) => void stdio.send(message);
  await http.start();
  await stdio.start();
  io.stdin.once('end', () => void stdio.close());
  await closed;
  await http.close();
  return 0;
}
