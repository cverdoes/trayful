/**
 * A client for engines: programs that run a game at a Trayful table. Knock to be let
 * in, then open a connection to follow the table, ask players and move pieces.
 * Published as `trayful/engine`; needs Node.js 22 or newer, for its WebSocket.
 */
export {
  knock,
  KnockRefused,
  TableConnection,
  type Credentials,
  type PromptResult,
  type RefusalReason,
  type TableEvents,
} from './client.js';
export type * from './protocol.js';
