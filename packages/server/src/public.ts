/**
 * What extensions build on, published as `trayful/server`. Everything here is a promise
 * to code in other repositories: add to it only when an extension needs something, and
 * note each change in CHANGELOG.md. While Trayful is 0.x, a minor version may change it.
 */

// Starting a server, with extensions.
export {
  DEFAULT_PORT,
  startServer,
  type ContainerOptions,
  type RunningServer,
  type ServerOptions,
} from './server.js';
export type { Extension } from './extension.js';

// The access hook: who counts as the host.
export {
  INVITE_COOKIE,
  PLAYER_COOKIE,
  bearer,
  cookie,
  isHostRequest,
  localAccess,
  parseCookies,
  type Access,
} from './play/access.js';

// Spaces: one base folder each, and finding the one a request is for.
export { openSpace, type Space, type SpaceResolver } from './space.js';
export { Workspace, type OpenOptions, type WorkspaceOptions } from './projects/workspace.js';
export { GitLink } from './git/link.js';
export { Repository, type RepositoryOptions } from './git/repository.js';

// The limits hook: how far a space may grow.
export { LimitError, type Growth, type Limits } from './play/limits.js';
