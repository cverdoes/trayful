import type { ClientMessage, Command, ProjectView, ServerMessage, TableState } from '@trayful/core';
import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface TrayfulStore {
  view?: ProjectView;
  table?: TableState;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  status: ConnectionStatus;
  /** Ids of selected top-level objects (pieces on the table and stacks). */
  selection: string[];
  /** The latest error from the server, shown briefly. */
  error?: { message: string; at: number };
  /** The latest change an agent made, shown briefly to people watching. */
  activity?: { text: string; at: number };
  /** Bumped when the server rejects a change, so the canvas redraws from server state. */
  redrawKey: number;
  shiftDown: boolean;
  helpOpen: boolean;
  /** Screen position of the table origin and pixels per millimetre. */
  viewport: { x: number; y: number; scale: number };

  /** Sends a message to the server; set by the connection. */
  send: (message: ClientMessage) => void;
  command: (command: Command) => void;
  receive: (message: ServerMessage) => void;
  select: (ids: string[], mode?: 'replace' | 'toggle' | 'add') => void;
}

export const useStore = create<TrayfulStore>((set, get) => ({
  revision: -1,
  canUndo: false,
  canRedo: false,
  status: 'connecting',
  selection: [],
  redrawKey: 0,
  shiftDown: false,
  helpOpen: false,
  viewport: { x: 0, y: 0, scale: 1 },
  send: () => {},
  command: (command) => get().send({ type: 'command', command }),
  receive: (message) => {
    if (message.type === 'snapshot-request') return;
    if (message.type === 'error') {
      set((s) => ({
        error: { message: message.message, at: Date.now() },
        redrawKey: s.redrawKey + 1,
      }));
      return;
    }
    if (message.revision < get().revision) return;
    const objects = message.state.objects;
    set((s) => ({
      table: message.state,
      revision: message.revision,
      canUndo: message.canUndo,
      canRedo: message.canRedo,
      ...(message.activity ? { activity: { text: message.activity.text, at: Date.now() } } : {}),
      // Drop selected ids that vanished or went into a stack.
      selection: s.selection.filter((id) => {
        const o = objects[id];
        return o && !(o.kind === 'piece' && o.parent);
      }),
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
