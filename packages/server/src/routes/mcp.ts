import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyReply } from 'fastify';
import { isHostRequest } from '../play/access.js';
import { EDITING_TOOLS } from '../mcp/authoring.js';
import { createMcpServer } from '../mcp/server.js';
import type { RouteContext } from './context.js';

/**
 * MCP over Streamable HTTP, stateless: each request gets its own server object, on the
 * workspace of the request's space.
 */
export function registerMcp(ctx: RouteContext): void {
  const { app } = ctx;
  app.post('/mcp', async (request, reply) => {
    // Agents run on the host's computer; MCP is never offered through a tunnel or the
    // network, except to the owner's agents in owner mode.
    if (!isHostRequest(request)) return app.access.refuseMcp(request, reply);
    const { workspace, url, git } = ctx.spaceOf(request);
    const tool = calledTool(request.body);
    if (git && tool && EDITING_TOOLS.has(tool)) git.journal.note('agent', tool);
    const mcp = createMcpServer(workspace, { url, git });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    reply.raw.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });
  const notAllowed = async (_req: unknown, reply: FastifyReply) =>
    reply.code(405).header('allow', 'POST').send({ error: 'Use POST for MCP requests.' });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}

/** The tool an MCP request calls, if it calls one. */
function calledTool(body: unknown): string | undefined {
  const call = body as { method?: unknown; params?: { name?: unknown } } | null;
  if (call?.method !== 'tools/call') return undefined;
  return typeof call.params?.name === 'string' ? call.params.name : undefined;
}
