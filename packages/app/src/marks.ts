// Stamp and text boxes on score sheets: what clicking and right-clicking one does.
import type { Command, MarkBox } from '@trayful/core';

/** A box someone clicked that needs a choice first: which stamp, or what text. */
export interface MarkPick {
  /** The box, such as `sheet.1/boxes/4`. */
  at: string;
  /** The stamps to choose from; empty for a text box. */
  stamps: string[];
  /** What a text box holds now, to edit. */
  text?: string;
  /** Where on the screen the dialog opens, in pixels. */
  screen: { x: number; y: number };
}

/**
 * What a click on a box does: a box that takes one stamp is stamped at once, and
 * left alone when it already has it; any other box asks which stamp, or what text.
 */
export function clickBox(
  box: MarkBox,
  screen: MarkPick['screen'],
): { command: Command } | { pick: MarkPick } | undefined {
  const at = box.spot.ref;
  if (box.spot.mode === 'text') {
    const text = box.mark && 'text' in box.mark ? box.mark.text : undefined;
    return { pick: { at, stamps: [], screen, ...(text === undefined ? {} : { text }) } };
  }
  const stamps = box.stamps.map((t) => t.id);
  if (stamps.length === 0) return undefined;
  if (stamps.length > 1) return { pick: { at, stamps, screen } };
  if (box.mark && 'stamp' in box.mark && box.mark.stamp === stamps[0]) return undefined;
  return { command: { type: 'mark', at, stamp: stamps[0]! } };
}

/** What a right-click on a box does: erases what is on it, if anything. */
export function eraseBox(box: MarkBox): Command | undefined {
  return box.mark ? { type: 'erase', at: box.spot.ref } : undefined;
}

/**
 * The command a filled-in text dialog sends: the new text, or an erase when it was
 * emptied; nothing when nothing changed.
 */
export function textCommand(pick: MarkPick, text: string): Command | undefined {
  const trimmed = text.trim();
  if (trimmed === (pick.text ?? '')) return undefined;
  return trimmed ? { type: 'mark', at: pick.at, text: trimmed } : { type: 'erase', at: pick.at };
}

/** How large text is written in a box, in millimetres: as large as fits, by a rough measure. */
export function textSize(text: string, [w, h]: [number, number]): number {
  // An average character is a little over half as wide as it is tall.
  return Math.min(h * 0.7, (w * 0.9) / (Math.max(text.length, 1) * 0.55));
}
