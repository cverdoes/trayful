// What the HTTP routes share: the workspace, finding the table a request names, and who is asking.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { caller, isLocalOrigin, isLocalRequest, type Caller } from '../access.js';
import type { Invite, Player, Players } from '../players.js';
import type { TableSession } from '../session.js';
import type { Workspace } from '../workspace.js';

/** A table named in a request; either part may be left out. */
export interface TableQuery {
  project?: string;
  table?: string;
}

export const NOT_INVITED = 'Ask the host for an invite link to join this table.';

export interface RouteContext {
  app: FastifyInstance;
  workspace: Workspace;
  players: Players;
  /** Addresses others reach this server at: the network's, and a tunnel's. */
  shareBases: string[];
  /** The server's own address, told to agents; set once the server listens. */
  url: string;
  /** The table a request names, or the one agents are playing on. */
  target: (query: TableQuery) => { project: string; table: string };
  sessionFor: (query: TableQuery) => Promise<TableSession>;
  /** Who a request is from. Requests from this computer without a cookie are the host. */
  identify: (request: FastifyRequest) => Promise<{ who: Caller; player: Player | undefined }>;
  /** Only the person at this computer may change which tables exist, or author. Replies 403 otherwise. */
  hostOnly: (request: FastifyRequest, reply: FastifyReply) => boolean;
  /** The links to an invite, one per address others reach this server at. */
  linksFor: (invite: Invite) => string[];
}

export function routeContext(app: FastifyInstance, workspace: Workspace): RouteContext {
  const { players } = workspace;
  const shareBases: string[] = [];
  const target = (query: TableQuery) =>
    query.project || query.table
      ? { project: query.project ?? workspace.active.projectId, table: query.table ?? 'table-1' }
      : { project: workspace.active.projectId, table: workspace.active.tableName };
  return {
    app,
    workspace,
    players,
    shareBases,
    url: '',
    target,
    sessionFor: (query) => {
      const { project, table } = target(query);
      return workspace.table(project, table);
    },
    identify: async (request) => {
      const who = caller(request, players);
      const player = who.player ?? (who.local ? await players.host() : undefined);
      return { who, player };
    },
    hostOnly: (request, reply) => {
      if (isLocalRequest(request) && isLocalOrigin(request.headers.origin)) return false;
      void reply.code(403).send({ error: 'Only the host can do that.' });
      return true;
    },
    linksFor: (invite) => shareBases.map((base) => `${base}/join/${invite.token}`),
  };
}
