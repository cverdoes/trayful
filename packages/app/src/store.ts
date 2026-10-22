import {
  onTable,
  type ClientMessage,
  type PlayerInfo,
  type RenderRequest,
  type Command,
  type ProjectView,
  type ServerMessage,
  type SnapSpot,
  type TableObject,
  type TableView,
} from '@trayful/core';
import { create } from 'zustand';
import type { GroupPick } from './groups';
import { loadHandHeight, loadHandMinimized } from './handTray';
import { startMotion, type Moving } from './motions';

/** Screen position of the table origin and pixels per millimetre. */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

type ConnectionStatus = 'connecting' | 'online' | 'offline';

/** Who this browser plays as, from `/api/me`. */
export interface Me {
  player?: Omit<PlayerInfo, 'online'>;
  /** Running on the host's computer: may manage tables, print and invite. */
  host: boolean;
  invited: boolean;
  joined: boolean;
}

interface TrayfulStore {
  view?: ProjectView;
  /** The table as this player sees it: other hands and face-down cards hidden. */
  table?: TableView;
  me?: Me;
  /** Before the table: asking for a name to join with, or no invite to get in. */
  gate?: 'join' | 'closed';
  /** Everyone at this table. */
  players: PlayerInfo[];
  /** While a piece is dragged over the hand tray. */
  overHand: boolean;
  /** Height of the hand tray in pixels; people can drag its top edge. */
  handHeight: number;
  /** Whether the hand tray is shrunk to a bubble in the corner; H toggles it. */
  handMinimized: boolean;
  inviteOpen: boolean;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  status: ConnectionStatus;
  /** Ids of selected top-level objects (pieces on the table and stacks). */
  selection: string[];
  /** The top-level object under the pointer; keys act on it when it is not selected. */
  hovered?: string;
  /** The latest error from the server, shown briefly. */
  error?: { message: string; at: number };
  /** Why the page cannot show a table at all, such as an unknown table name. */
  fatal?: string;
  /** A component an agent asked to see, waiting to be drawn. */
  renderJob?: { id: string; component: RenderRequest };
  /** Errors in the project files after an edit; the table keeps the last good version meanwhile. */
  problems?: string[];
  /** The latest change someone else made, shown briefly to people watching. */
  activity?: { text: string; name: string; agent: boolean; at: number };
  /** Dice rolling and piles being shuffled now, by id. */
  moving: Record<string, Moving>;
  /** Bumped when the server rejects a change, so the canvas redraws from server state. */
  redrawKey: number;
  shiftDown: boolean;
  helpOpen: boolean;
  /** While dragging: the snap spots the dragged piece could go to, and the one it would snap to. */
  snapHint?: { spots: SnapSpot[]; size: [number, number]; active?: string };
  /** The pieces of a crowded group spot someone clicked, to pick one from. */
  groupPick?: GroupPick;
  viewport: Viewport;

  /** Sends a message to the server; set by the connection. */
  send: (message: ClientMessage) => void;
  command: (command: Command) => void;
  receive: (message: ServerMessage) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
}

export const useStore = create<TrayfulStore>((set, get) => ({
  revision: -1,
  players: [],
  overHand: false,
  handHeight: loadHandHeight(),
  handMinimized: loadHandMinimized(),
  inviteOpen: false,
  canUndo: false,
  canRedo: false,
  status: 'connecting',
  selection: [],
  moving: {},
  redrawKey: 0,
  shiftDown: false,
  helpOpen: false,
  viewport: { x: 0, y: 0, scale: 1 },
  send: dropWhileOffline,
  command: (command) => get().send({ type: 'command', command }),
  receive: (message) => {
    if (message.type === 'snapshot-request' || message.type === 'render-request') return;
    if (message.type === 'project') {
      set({ view: message.view, problems: undefined });
      return;
    }
    if (message.type === 'problems') {
      set({ problems: message.problems });
      return;
    }
    if (message.type === 'players') {
      set({ players: message.players });
      return;
    }
    if (message.type === 'error') {
      set((s) => ({
        error: { message: message.message, at: Date.now() },
        redrawKey: s.redrawKey + 1,
      }));
      return;
    }
    if (message.revision < get().revision) return;
    const objects = message.state.objects;
    const { activity } = message;
    const mine = activity?.player !== undefined && activity.player === get().me?.player?.id;
    set((s) => ({
      table: message.state,
      revision: message.revision,
      canUndo: message.canUndo,
      canRedo: message.canRedo,
      ...(activity && !mine
        ? {
            activity: {
              text: activity.text,
              name: activity.name ?? (activity.by === 'agent' ? 'Agent' : 'Someone'),
              agent: activity.by === 'agent',
              at: Date.now(),
            },
          }
        : {}),
      // Everyone sees dice tumble and piles riffle, whoever rolled or shuffled them.
      ...(activity?.motion
        ? { moving: startMotion(s.moving, activity.motion, performance.now()) }
        : {}),
      // Drop selected and hovered ids that vanished or went into a stack.
      selection: s.selection.filter((id) => isOnTable(objects[id])),
      hovered: s.hovered && isOnTable(objects[s.hovered]) ? s.hovered : undefined,
    }));
  },
  select: (ids, mode = 'replace') =>
    set((s) => {
      if (mode === 'replace') return { selection: ids };
      if (mode === 'add') return { selection: [...new Set([...s.selection, ...ids])] };
      const next = new Set(s.selection);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { selection: [...next] };
    }),
}));

function isOnTable(object: TableObject | undefined): boolean {
  return object !== undefined && onTable(object);
}

/** Stands in for `send` while there is no connection; the server sends the table again on reconnect. */
export function dropWhileOffline(): void {
  // Nothing to send to.
}
