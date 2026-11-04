// Group spots on the table: separate pieces sharing one spot, any of which can be picked.
import { allSpots, occupants, type Command, type Piece, type TableState } from '@trayful/core';
import type { Types } from './render/geometry';

/** A group's pieces, for the picker: where they lie, and the one that was clicked. */
export interface GroupPick {
  /** The group spot, such as `board/track/3`. */
  spot: string;
  /** Its pieces, top first. */
  ids: string[];
  /** Where on the screen the picker opens, in pixels. */
  at: { x: number; y: number };
}

/** The pieces that share a group spot with an object, top first, when there are two or more. */
export function groupMembers(table: TableState, types: Types, id: string): string[] | undefined {
  const spot = table.objects[id]?.snap;
  if (!spot || allSpots(table, types).find((s) => s.ref === spot)?.mode !== 'group') return;
  const members = occupants(table, spot).sort((a, b) => b.z - a.z);
  return members.length > 1 ? members.map((o) => o.id) : undefined;
}

/** The picker for a clicked object, at a point on the screen, when it lies in a crowded group. */
export function pickFor(
  table: TableState,
  types: Types,
  id: string,
  at: GroupPick['at'],
): GroupPick | undefined {
  const ids = groupMembers(table, types, id);
  return ids && { spot: table.objects[id]!.snap!, ids, at };
}

/**
 * What the picker lists for each piece still in the group: the piece itself, or
 * the top piece of a stack. Pieces moved away since it opened drop out.
 */
export function pickEntries(
  table: TableState,
  { spot, ids }: Pick<GroupPick, 'spot' | 'ids'>,
): { id: string; piece: Piece }[] {
  return ids.flatMap((id) => {
    const object = table.objects[id];
    if (object?.snap !== spot) return [];
    const shown = object.kind === 'stack' ? table.objects[object.items.at(-1)!] : object;
    return shown?.kind === 'piece' ? [{ id, piece: shown }] : [];
  });
}

/** Where the picker opens: beside the click, kept clear of the right and bottom edges. */
export function pickerCorner(
  at: GroupPick['at'],
  room: { width: number; height: number },
): GroupPick['at'] {
  return {
    x: Math.max(0, Math.min(at.x, room.width - PICKER_ROOM.x)),
    y: Math.max(0, Math.min(at.y, room.height - PICKER_ROOM.y)),
  };
}

/** About how much room the picker takes, in pixels. */
const PICKER_ROOM = { x: 380, y: 240 };

/** Brings one piece of a group to the top without moving it, so it is the one a drag picks up. */
export function raise(id: string, spot: string): Command {
  return { type: 'move', ids: [id], by: [0, 0], into: spot };
}
