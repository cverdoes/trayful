// What the HTTP routes share: finding the space and table a request is for, and who is asking.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { caller, isHostRequest, type Caller } from '../play/access.js';
import type { Invite, Player } from '../play/players.js';
import type { TableSession } from '../play/session.js';
import type { Space, SpaceResolver } from '../space.js';

/** A table named in a request; either part may be left out. */
export interface TableQuery {
  project?: string;
  table?: string;
}

export const NOT_INVITED = 'Ask the host for an invite link to join this table.';

export interface RouteContext {
  app: FastifyInstance;
  /** The space a request is for. Routes look it up for every request, never once. */
  spaceOf: SpaceResolver;
  /** The table a request names, or the one agents are playing on, in the request's space. */
  target: (request: FastifyRequest, query: TableQuery) => { project: string; table: string };
  sessionFor: (request: FastifyRequest, query: TableQuery) => Promise<TableSession>;
  /** Who a request is from. Requests from this computer without a cookie are the host. */
  identify: (request: FastifyRequest) => Promise<{ who: Caller; player: Player | undefined }>;
  /** Only the host may change which tables exist, or author. Replies 403 otherwise. */
  hostOnly: (request: FastifyRequest, reply: FastifyReply) => boolean;
  /** The links to an invite, one per address others reach the request's space at. */
  linksFor: (request: FastifyRequest, invite: Invite) => string[];
}

/** The table a query names in a space, or the one agents are playing on. */
export function targetIn(space: Space, query: TableQuery): { project: string; table: string } {
  const { active } = space.workspace;
  return query.project || query.table
    ? { project: query.project ?? active.projectId, table: query.table ?? 'table-1' }
    : { project: active.projectId, table: active.tableName };
}

export function routeContext(app: FastifyInstance, spaceOf: SpaceResolver): RouteContext {
  const target = (request: FastifyRequest, query: TableQuery) => targetIn(spaceOf(request), query);
  return {
    app,
    spaceOf,
    target,
    sessionFor: (request, query) => {
      const { project, table } = target(request, query);
      return spaceOf(request).workspace.table(project, table);
    },
    identify: async (request) => {
      const { players } = spaceOf(request);
      const who = caller(request, players);
      const player = who.player ?? (who.local ? await players.host() : undefined);
      return { who, player };
    },
    hostOnly: (request, reply) => {
      if (isHostRequest(request)) return false;
      void reply.code(403).send({ error: 'Only the host can do that.' });
      return true;
    },
    linksFor: (request, invite) =>
      spaceOf(request).shareBases.map((base) => `${base}/join/${invite.token}`),
  };
}
