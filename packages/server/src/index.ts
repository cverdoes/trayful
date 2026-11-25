/**
 * The server's public API: starting it, table sessions, the MCP server, workspaces and
 * migration, and what extensions build on.
 */
export * from './server.js';
export type { Extension } from './extension.js';
export {
  INVITE_COOKIE,
  PLAYER_COOKIE,
  bearer,
  cookie,
  isHostRequest,
  parseCookies,
  type Access,
} from './play/access.js';
export * from './play/session.js';
export * from './mcp/server.js';
export * from './projects/workspace.js';
export * from './projects/migrate.js';
export {
  markBase,
  projectDirs,
  resolveBase,
  otherFilesIn,
  type BaseFolder,
} from './projects/base.js';
export * from './shipped/skill.js';
export { RESOURCE_SOURCES } from './shipped/resources.js';
