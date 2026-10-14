import type { Vec2 } from '@trayful/formats/browser';
import type { StackLayout } from './layout.js';
import { move } from './move.js';
import { flip, roll, rotate, setValue } from './piece-commands.js';
import { deal, draw, layout, shuffle, stack, take } from './pile-commands.js';
import type { Catalog, TableState } from './state.js';
import { CommandError, Transaction, unique, type Target } from './transaction.js';

export { CommandError, type Target };

/**
 * Every change to a table is one of these commands. The UI and the MCP server
 * both send commands, so they share validation, undo and the history log.
 */
export type Command =
  /**
   * Move objects by an offset, or move them to a target. With a position the first
   * object goes there and the others keep their places relative to it; with a snap
   * target each object takes the next free spot. `into` records that the moved
   * objects now sit in a snap spot or area, without changing where they land.
   * Pieces snapped onto a moved object ride along with it. Pieces played from a
   * hand land side by side at `to`, turned to `face` (default up).
   */
  | {
      type: 'move';
      ids: string[];
      by?: Vec2;
      to?: Target;
      into?: string;
      face?: 'up' | 'down';
    }
  /** Turn objects over. Flipping a stack turns the whole pile over, reversing its order. */
  | { type: 'flip'; ids: string[] }
  /** Rotate by whole steps of the type's `rotationStep` (default 90°), or by free degrees. */
  | { type: 'rotate'; ids: string[]; steps?: number; degrees?: number }
  /** Put objects on top of a piece or stack, in the order given (last ends on top). */
  | { type: 'stack'; ids: string[]; onto: string }
  /** Take cards off the top of a stack to a target. Several cards land as a new stack. */
  | { type: 'draw'; from: string; count?: number; to: Target; face?: 'up' | 'down' }
  /**
   * Deal cards from the top of a stack, one at a time to each target in turn, for
   * `count` rounds. A whole snap target such as `main-board/market` counts as each
   * of its spots. Cards dealt to the same place form a pile.
   */
  | { type: 'deal'; from: string; to: Target | Target[]; count?: number; face?: 'up' | 'down' }
  /** Take one particular piece out of a stack, wherever it is in the pile. */
  | { type: 'take'; id: string; to: Target; face?: 'up' | 'down' }
  /** Change how a stack's pieces lie: in a pile, a fan, or spread out side by side. */
  | { type: 'layout'; id: string; layout: StackLayout }
  | { type: 'shuffle'; id: string }
  | { type: 'roll'; id: string }
  /** Set a counter's number or a die's face. */
  | { type: 'setValue'; id: string; value: number | string }
  | { type: 'lock'; ids: string[]; locked: boolean };

export type CommandType = Command['type'];

/** Applies a command and returns the new state. The input state is never modified. */
export function applyCommand(state: TableState, command: Command, catalog: Catalog): TableState {
  const tx = new Transaction(state, catalog);
  switch (command.type) {
    case 'move':
      move(tx, command);
      break;
    case 'flip':
      for (const id of unique(command.ids)) flip(tx, id);
      break;
    case 'rotate':
      for (const id of unique(command.ids)) rotate(tx, id, command.steps, command.degrees);
      break;
    case 'stack':
      stack(tx, command.ids, command.onto);
      break;
    case 'draw':
      draw(tx, command);
      break;
    case 'deal':
      deal(tx, command);
      break;
    case 'take':
      take(tx, command.id, command.to, command.face);
      break;
    case 'layout':
      layout(tx, command.id, command.layout);
      break;
    case 'shuffle':
      shuffle(tx, command.id);
      break;
    case 'roll':
      roll(tx, command.id);
      break;
    case 'setValue':
      setValue(tx, command.id, command.value);
      break;
    case 'lock':
      for (const id of unique(command.ids))
        tx.update(tx.onTable(id), { locked: command.locked || undefined });
      break;
    default:
      throw new CommandError(`Unknown command "${(command as { type: string }).type}".`);
  }
  return tx.commit();
}
