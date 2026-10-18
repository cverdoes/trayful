/** Height of the hand tray along the bottom of the screen, in pixels, until someone resizes it. */
export const HAND_HEIGHT = 120;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
/** The tray never covers more than this share of the window. */
const MAX_SHARE = 0.6;
/** The tray's padding and border around a card, in pixels. */
const CARD_MARGIN = 28;
const KEY = 'trayful.handHeight';

/** Keeps a tray height between the smallest useful tray and most of the window, if one is given. */
export function clampHandHeight(height: number, windowHeight = Infinity): number {
  const max = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, windowHeight * MAX_SHARE));
  return Math.round(Math.min(max, Math.max(MIN_HEIGHT, height)));
}

/** How tall a card in a tray of this height is drawn. */
export function handCardHeight(trayHeight: number): number {
  return trayHeight - CARD_MARGIN;
}

/** The tray height this browser last used, or the default. */
export function loadHandHeight(): number {
  try {
    const saved = Number(localStorage.getItem(KEY));
    return saved > 0 ? clampHandHeight(saved) : HAND_HEIGHT;
  } catch {
    // Storage can be switched off, and is missing outside a browser; the default height is fine then.
    return HAND_HEIGHT;
  }
}

/** Remembers the tray height in this browser. */
export function saveHandHeight(height: number): void {
  try {
    localStorage.setItem(KEY, String(height));
  } catch {
    // Not remembering the height is harmless.
  }
}
