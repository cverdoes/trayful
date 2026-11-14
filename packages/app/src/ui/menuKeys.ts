// The keys of a menu: which item the arrow keys, Home and End move the focus to.

/**
 * The item a key moves to from the current one, skipping items that cannot be
 * picked and going round at the ends. Undefined when the key moves nowhere.
 * `current` is -1 when no item has the focus.
 */
export function itemAfterKey(key: string, current: number, enabled: boolean[]): number | undefined {
  const open = enabled.flatMap((on, i) => (on ? [i] : []));
  if (open.length === 0) return undefined;
  const place = open.indexOf(current);
  switch (key) {
    case 'ArrowDown':
      return open[(place + 1) % open.length];
    case 'ArrowUp':
      return open[(Math.max(place, 0) - 1 + open.length) % open.length];
    case 'Home':
      return open[0];
    case 'End':
      return open.at(-1);
    default:
      return undefined;
  }
}
