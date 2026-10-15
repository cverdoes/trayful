import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyReply } from 'fastify';
import { isLocalOrigin, isLocalRequest } from '../access.js';
import { createMcpServer } from '../mcp.js';
import type { RouteContext } from './context.js';

/**
 * MCP over Streamable HTTP, stateless: each request gets its own server object, all
 * sharing the one workspace.
 */
export function registerMcp(ctx: RouteContext): void {
  const { app } = ctx;
  app.post('/mcp', async (request, reply) => {
    // Agents run on the host's computer; MCP is never offered through a tunnel or the network.
    if (!isLocalRequest(request) || !isLocalOrigin(request.headers.origin)) {
      return reply.code(403).send({ error: 'MCP is only available from this computer.' });
    }
    const mcp = createMcpServer(ctx.workspace, { url: ctx.url });
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
