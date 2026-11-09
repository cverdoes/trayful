import {
  onTable,
  type ClientMessage,
  type PlayerInfo,
  type PlayerPrompt,
  type RenderRequest,
  type Command,
  type ProjectView,
  type ServerMessage,
  type SnapSpot,
  type TableObject,
  type TableView,
} from '@trayful/core';
import { create } from 'zustand';
import type { GroupPick } from './table/groups';
import type { MarkPick } from './table/marks';
import { loadHandHeight, loadHandMinimized } from './table/handTray';
import { startMotion, type Moving } from './motion/motions';
import { route } from './route';
import {
  changedSurfaces,
  defaultChoice,
  loadChoice,
  shownSurfaces,
  type SurfaceChoice,
} from './table/surfaces';

/** Screen position of the table origin and pixels per millimetre. */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

/** A piece shown large in the middle of the screen, from the moment Space went down. */
interface Magnifier {
  piece: string;
  opened: number;
  /** Opened by a quick tap, so it stays until Space, Esc or a click closes it. */
  sticky: boolean;
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
  /** Questions and messages this player has still to answer, oldest first. */
  prompts: PlayerPrompt[];
  /** What the player has picked so far for the first prompt, when it asks for pieces or a place. */
  picked: string[];
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
  /** The piece under the pointer, on the table or in the hand, which Space magnifies. */
  hoveredPiece?: string;
  magnifier?: Magnifier;
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
  snapHint?: { surface: string; spots: SnapSpot[]; size: [number, number]; active?: string };
  /** The pieces of a crowded group spot someone clicked, to pick one from. */
  groupPick?: GroupPick;
  /** A stamp or text box someone clicked, waiting for them to pick a stamp or write. */
  markPick?: MarkPick;
  /** Each surface's viewport, by surface id; a tile shows one. */
  viewports: Record<string, Viewport>;
  /**
   * Which surfaces this viewer chose to show, kept per table in this browser; until
   * they choose, `defaultChoice` decides.
   */
  surfaceChoice?: SurfaceChoice;
  /** A surface enlarged to the whole canvas for a while. */
  focus?: string;
  /** When something last changed on each surface while it was hidden, to make its chip pulse. */
  pulses: Record<string, number>;

  /** Sends a message to the server; set by the connection. */
  send: (message: ClientMessage) => void;
  command: (command: Command) => void;
  receive: (message: ServerMessage) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
}

export const useStore = create<TrayfulStore>((set, get) => ({
  revision: -1,
  players: [],
  prompts: [],
  picked: [],
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
  viewports: {},
  pulses: {},
  send: dropWhileOffline,
  command: (command) => get().send({ type: 'command', command }),
  receive: (message) => {
    if (message.type !== 'state') {
      set((s) => besideTheTable(message, s));
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
      ...withoutVanished(s, objects),
      ...surfaceNews(s, message.state, !mine),
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

/**
 * The surface choice kept for a table when it first arrives (or another table
 * replaces it), and pulses for hidden surfaces someone else just changed.
 */
function surfaceNews(
  s: Pick<TrayfulStore, 'table' | 'surfaceChoice' | 'me' | 'pulses' | 'focus'>,
  next: TableView,
  byOthers: boolean,
): Partial<TrayfulStore> {
  if (s.table?.table !== next.table) return { surfaceChoice: loadChoice(choiceKey(next.table)) };
  if (!byOthers) return {};
  const player = s.me?.player?.id;
  const choice = s.surfaceChoice ?? defaultChoice(next, player);
  const shown = new Set(shownSurfaces(next, choice, player, s.focus));
  const hidden = [...changedSurfaces(s.table, next)].filter((id) => !shown.has(id));
  if (hidden.length === 0) return {};
  const now = Date.now();
  return { pulses: { ...s.pulses, ...Object.fromEntries(hidden.map((id) => [id, now])) } };
}

/** Where this browser keeps its surface choice for a table. */
export function choiceKey(table: string): string {
  // Outside a browser, as in tests, there is no address to name the project.
  const project = typeof location === 'undefined' ? undefined : route().project;
  return `${project ?? ''}/${table}`;
}

/** The surfaces this viewer shows now, in tile order. */
export function shownNow(
  s: Pick<TrayfulStore, 'table' | 'surfaceChoice' | 'me' | 'focus'>,
): string[] {
  if (!s.table) return [];
  const player = s.me?.player?.id;
  return shownSurfaces(s.table, s.surfaceChoice ?? defaultChoice(s.table, player), player, s.focus);
}

/** What a message other than a new table changes in the store. */
function besideTheTable(
  message: Exclude<ServerMessage, { type: 'state' }>,
  s: Pick<TrayfulStore, 'redrawKey' | 'prompts'>,
): Partial<TrayfulStore> {
  switch (message.type) {
    case 'project':
      return { view: message.view, problems: undefined };
    case 'problems':
      return { problems: message.problems };
    case 'players':
      return { players: message.players };
    case 'prompts':
      // Picks so far belong to the prompt on show; a new one starts with none.
      return message.prompts[0]?.id === s.prompts[0]?.id
        ? { prompts: message.prompts }
        : { prompts: message.prompts, picked: [] };
    case 'error':
      return { error: { message: message.message, at: Date.now() }, redrawKey: s.redrawKey + 1 };
    default:
      // Picture requests are answered by the connection itself.
      return {};
  }
}

/**
 * Drops selected and hovered ids that vanished or went into a stack, and closes the
 * magnifier on a piece that is gone, such as a card someone else took into their hand.
 */
function withoutVanished(
  s: Pick<TrayfulStore, 'selection' | 'hovered' | 'hoveredPiece' | 'magnifier'>,
  objects: TableView['objects'],
) {
  return {
    selection: s.selection.filter((id) => isOnTable(objects[id])),
    hovered: s.hovered && isOnTable(objects[s.hovered]) ? s.hovered : undefined,
    hoveredPiece: s.hoveredPiece && objects[s.hoveredPiece] ? s.hoveredPiece : undefined,
    magnifier: s.magnifier && objects[s.magnifier.piece] ? s.magnifier : undefined,
  };
}

function isOnTable(object: TableObject | undefined): boolean {
  return object !== undefined && onTable(object);
}

/** Stands in for `send` while there is no connection; the server sends the table again on reconnect. */
export function dropWhileOffline(): void {
  // Nothing to send to.
}
