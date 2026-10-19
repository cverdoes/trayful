import mark from './assets/trayful-mark.svg';

/** The Trayful mark: a tray of cards, a meeple, a die and a hex tile. Decorative, so no alt text. */
export function Mark({ size }: Readonly<{ size: number }>) {
  // The drawing is 448 x 362.
  return (
    <img className="mark" src={mark} alt="" width={size} height={Math.round((size * 362) / 448)} />
  );
}
