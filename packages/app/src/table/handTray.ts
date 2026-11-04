/** Height of the hand tray along the bottom of the screen, in pixels, until someone resizes it. */
export const HAND_HEIGHT = 120;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;
/** The tray never covers more than this share of the window. */
const MAX_SHARE = 0.6;
/** The tray's padding and border around a card, in pixels. */
const CARD_MARGIN = 28;
const HEIGHT_KEY = 'trayful.handHeight';
const MINIMIZED_KEY = 'trayful.handMinimized';

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
  const saved = Number(recall(HEIGHT_KEY));
  return saved > 0 ? clampHandHeight(saved) : HAND_HEIGHT;
}

/** Remembers the tray height in this browser. */
export function saveHandHeight(height: number): void {
  remember(HEIGHT_KEY, String(height));
}

/** Whether this browser last left the tray shrunk to a bubble. */
export function loadHandMinimized(): boolean {
  return recall(MINIMIZED_KEY) === 'true';
}

/** Remembers whether the tray is shrunk to a bubble in this browser. */
export function saveHandMinimized(minimized: boolean): void {
  remember(MINIMIZED_KEY, String(minimized));
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Storage can be switched off, and is missing outside a browser; the defaults are fine then.
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembering the tray is harmless.
  }
}
