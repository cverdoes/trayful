/**
 * Compares text in plain code-unit order. Unlike `localeCompare`, the result does not
 * depend on the machine's locale, so saved files and generated ids stay the same everywhere.
 */
export function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}
