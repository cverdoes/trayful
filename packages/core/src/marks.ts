// Stamps and text on a sheet's stamp and text spots, as in roll-and-write games.
import {
  areaAccepts,
  takesMarks,
  type ComponentType,
  type Mark,
  type Vec2,
} from '@trayful/formats/browser';
import { spotsOf, type SnapSpot } from './snap.js';
import { sizeOf, type Catalog, type Piece } from './state.js';
import { CommandError, type Transaction } from './transaction.js';

/** The longest text a text spot holds. */
export const MAX_MARK_TEXT = 200;

/** The key a spot's mark is kept under on its piece: `target/index`. */
export function markKey(spot: Pick<SnapSpot, 'target' | 'index'>): string {
  return `${spot.target}/${spot.index}`;
}

/** The stamps a stamp spot takes: those it names, or every stamp when it names none. */
export function stampsFor(spot: Pick<SnapSpot, 'accepts'>, catalog: Catalog): ComponentType[] {
  return Object.values(catalog).filter((t) => t.is === 'stamp' && areaAccepts(spot, t));
}

/** The size of a text spot that is not in a grid, in millimetres. */
const TEXT_BOX = 10;

/** A stamp or text spot of a piece, as a box to mark: where it is, how large, and what it takes. */
export interface MarkBox {
  spot: SnapSpot;
  /** Where the mark is kept on the piece, as `target/index`. */
  key: string;
  /** Width and height, before the piece's rotation. */
  size: Vec2;
  /** The stamps it takes; empty for a text spot. */
  stamps: ComponentType[];
  mark?: Mark;
}

/**
 * The stamp and text spots of a piece as boxes: a grid spot is the size of its cell,
 * other spots are as large as their largest stamp, or `TEXT_BOX` square for text.
 */
export function markBoxes(piece: Piece, catalog: Catalog): MarkBox[] {
  const type = catalog[piece.type];
  if (!type) return [];
  return spotsOf(piece, type)
    .filter((spot) => takesMarks(spot.mode))
    .map((spot) => {
      const stamps = spot.mode === 'stamp' ? stampsFor(spot, catalog) : [];
      const key = markKey(spot);
      const mark = piece.marks?.[key];
      return { spot, key, size: spot.cell ?? boxFor(stamps), stamps, ...(mark ? { mark } : {}) };
    });
}

function boxFor(stamps: ComponentType[]): Vec2 {
  if (stamps.length === 0) return [TEXT_BOX, TEXT_BOX];
  const sizes = stamps.map(sizeOf);
  return [Math.max(...sizes.map((s) => s[0])), Math.max(...sizes.map((s) => s[1]))];
}

/** Presses a stamp onto a stamp spot, or writes text on a text spot, replacing what was there. */
export function mark(tx: Transaction, { at, stamp, text }: MarkRequest): void {
  const { spot, owner } = markSpot(tx, at);
  const next =
    spot.mode === 'text' ? textMark(spot, stamp, text) : stampMark(tx, spot, stamp, text);
  tx.update(owner, { marks: { ...owner.marks, [markKey(spot)]: next } });
}

/** Where to mark, and with what: a stamp's id or some text. */
export interface MarkRequest {
  at: string;
  stamp?: string;
  text?: string;
}

/** Takes the stamp or text off a spot. */
export function erase(tx: Transaction, at: string): void {
  const { spot, owner } = markSpot(tx, at);
  const key = markKey(spot);
  if (!owner.marks?.[key]) throw new CommandError(`"${at}" has nothing to erase.`);
  const marks = Object.fromEntries(Object.entries(owner.marks).filter(([k]) => k !== key));
  tx.update(owner, { marks: Object.keys(marks).length ? marks : undefined });
}

/** One stamp or text spot, on a piece lying on the table. */
function markSpot(tx: Transaction, at: string): { spot: SnapSpot; owner: Piece } {
  const spots = tx.resolve(at);
  const spot = spots[0]!;
  if (!takesMarks(spot.mode))
    throw new CommandError(`"${spot.owner}/${spot.target}" is not a stamp or text spot.`);
  if (spots.length > 1 || spot.index === undefined)
    throw new CommandError(`Name one spot, such as "${spot.ref}".`);
  return { spot, owner: tx.piece(spot.owner) };
}

function textMark(spot: SnapSpot, stamp: unknown, text: unknown): Mark {
  if (stamp !== undefined) throw new CommandError(`"${spot.ref}" takes text, not a stamp.`);
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) throw new CommandError('Give some text to write.');
  if (trimmed.length > MAX_MARK_TEXT)
    throw new CommandError(`Text is limited to ${MAX_MARK_TEXT} characters.`);
  return { text: trimmed };
}

function stampMark(tx: Transaction, spot: SnapSpot, stamp: unknown, text: unknown): Mark {
  if (text !== undefined) throw new CommandError(`"${spot.ref}" takes a stamp, not text.`);
  const accepted = stampsFor(spot, tx.catalog);
  const chosen = accepted.find((t) => t.id === stamp);
  if (!chosen) {
    const names = accepted.map((t) => t.id).join(', ') || 'none';
    throw new CommandError(`"${spot.ref}" takes the stamps ${names}, not "${String(stamp)}".`);
  }
  return { stamp: chosen.id };
}
