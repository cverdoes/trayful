import type { Drawing } from '@trayful/formats/browser';

/** Outlines Konva draws around their centre; the others start at their top-left corner. */
const CENTRED = new Set<Drawing['outline']>(['circle', 'disc', 'ellipse', 'hex', 'triangle']);

/**
 * A soft light-to-shade gradient laid over a token so it reads as a solid piece rather
 * than a flat cut-out: lighter at the top, darker at the bottom. Cards, boards and tiles
 * (plain rectangles) carry their own art and are left alone, as are pieces lying flat
 * and see-through ones such as stamps, where the shading would be all that shows.
 */
export function sheenOf(
  { outline, fill }: Pick<Drawing, 'outline' | 'fill'>,
  h: number,
  flat: boolean,
):
  | {
      fillLinearGradientStartPoint: { x: number; y: number };
      fillLinearGradientEndPoint: { x: number; y: number };
      fillLinearGradientColorStops: (number | string)[];
    }
  | undefined {
  if (flat || outline === 'rect' || fill === 'transparent') return undefined;
  const top = CENTRED.has(outline) ? -h / 2 : 0;
  return {
    fillLinearGradientStartPoint: { x: 0, y: top },
    fillLinearGradientEndPoint: { x: 0, y: top + h },
    fillLinearGradientColorStops: [
      0,
      'rgba(255,255,255,0.35)',
      0.45,
      'rgba(255,255,255,0)',
      1,
      'rgba(0,0,0,0.22)',
    ],
  };
}
