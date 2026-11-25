import type { FastifyRequest } from 'fastify';
import type { GitLink } from './git/link.js';
import { Connections } from './play/connections.js';
import { Knocks } from './play/knocks.js';
import type { Players } from './play/players.js';
import type { Workspace } from './projects/workspace.js';

/**
 * One base folder and everything served from it: its projects and open tables, its
 * players, its repository, and the live connections to it. A Trayful on someone's own
 * computer has exactly one; an extension may serve several, one per request.
 */
export interface Space {
  workspace: Workspace;
  /** Who may join: the players of this space, with their invites. */
  readonly players: Players;
  /** The repository of a git-backed space; undefined for a folder. */
  git?: GitLink;
  /** Addresses others reach this space at: the network's, a tunnel's or a public one. */
  shareBases: string[];
  /** The space's own address, told to agents; set once the server listens. */
  url: string;
  /** The live connections of each player, so one sent away can be cut off. */
  connections: Connections;
  /** Engines waiting for the host to let them in. */
  knocks: Knocks;
}

/** Finds the space a request is for. */
export type SpaceResolver = (request: FastifyRequest) => Space;

/** A space for a workspace, and its repository when it has one. */
export function openSpace(workspace: Workspace, git?: GitLink): Space {
  return {
    workspace,
    get players() {
      return workspace.players;
    },
    git,
    shareBases: [],
    url: '',
    connections: new Connections(),
    knocks: new Knocks(workspace.players),
  };
}
