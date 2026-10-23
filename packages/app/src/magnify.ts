import {
  boundsOf,
  ridersOf,
  toLocal,
  type Bounds,
  type Piece,
  type TableObject,
  type TableState,
} from '@trayful/core';
import type { Types } from './render/geometry';
import { useStore } from './store';

/** Releasing Space sooner than this after pressing it keeps the magnifier open. */
export const TAP_MS = 300;

/**
 * Space went down or up. Holding it shows the piece under the pointer large until
 * it is let go; a quick tap leaves it open until the next tap. Returns whether
 * Space did something, so the page can keep it from pressing a focused button.
 */
export function spaceKey(down: boolean, repeat: boolean, now: number): boolean {
  const { magnifier, hoveredPiece, helpOpen, inviteOpen } = useStore.getState();
  if (!magnifier) {
    if (!down || repeat || !hoveredPiece || helpOpen || inviteOpen) return false;
    useStore.setState({ magnifier: { piece: hoveredPiece, opened: now, sticky: false } });
    return true;
  }
  if (repeat) return true;
  if (!down && !magnifier.sticky && now - magnifier.opened < TAP_MS) {
    useStore.setState({ magnifier: { ...magnifier, sticky: true } });
  } else if (down === magnifier.sticky) {
    closeMagnifier();
  }
  return true;
}

export function closeMagnifier(): void {
  if (useStore.getState().magnifier) useStore.setState({ magnifier: undefined });
}

/**
 * The magnified piece as this player sees it, unturned. The table only holds what
 * the player may see, so face-down cards show their backs and other players' hands
 * are not there at all. Cards in the player's own hand show their faces, as in the hand.
 */
export function magnifiedPiece(table: TableState, id: string): Piece | undefined {
  const piece = table.objects[id];
  if (piece?.kind !== 'piece') return undefined;
  return { ...piece, pos: [0, 0], rot: 0, face: piece.hand ? 'up' : piece.face };
}

/** What the magnifier shows: a piece, unturned around (0, 0), and what lies on it. */
export interface MagnifiedScene {
  piece: Piece;
  /** Everything snapped onto the piece, and onto those in turn, bottom to top, placed relative to it. */
  riders: TableObject[];
  /** The box around the piece and its riders, to fit the window to. */
  bounds: Bounds;
}

/**
 * The magnified piece with whatever rides along with it, so a player board shows
 * with the workers and cards on it. Only what the player may see is on the table,
 * so riders show as they do there.
 */
export function magnifiedScene(
  table: TableState,
  types: Types,
  id: string,
): MagnifiedScene | undefined {
  const piece = magnifiedPiece(table, id);
  const owner = table.objects[id];
  if (!piece || !owner) return undefined;
  const riders = ridersOf(table.objects, [id])
    .map((rider) => table.objects[rider]!)
    .sort((a, b) => a.z - b.z)
    .map((rider) => ({
      ...rider,
      pos: toLocal(owner, [0, 0], rider.pos),
      rot: rider.rot - owner.rot,
    }));
  return { piece, riders, bounds: boundsOf(table, types, [piece, ...riders]) };
}
