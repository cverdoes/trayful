import { allSpots, CENTRE, type SnapSpot } from '@trayful/core';
import { Group, Rect } from 'react-konva';
import { useStore } from '../store';
import { clickForPrompt, promptMarks } from './promptTargets';

/** How big a spot is drawn when it has no size of its own, in millimetres. */
const POINT_SPOT = 12;
const GOLD = '#e3b341';

/**
 * The drop areas and spots a prompt names, outlined in gold on the table. When the
 * prompt asks for a place, they take the click that picks one.
 */
export function PromptPlaces() {
  const prompt = useStore((s) => s.prompts[0]);
  const picked = useStore((s) => s.picked);
  const table = useStore((s) => s.table);
  const view = useStore((s) => s.view);
  const scale = useStore((s) => s.viewport.scale);
  if (!prompt || !table || !view) return null;
  const places = [...promptMarks(prompt)].filter((name) => name.includes('/'));
  if (places.length === 0) return null;
  const spots = allSpots(table, view.types, CENTRE);
  return (
    <Group>
      {places.flatMap((place) =>
        spotsOf(spots, place).map((spot) => {
          const [w, h] = spot.area ?? spot.cell ?? [POINT_SPOT, POINT_SPOT];
          const chosen = picked.includes(place);
          // Only places the player may pick take clicks; the rest only glow.
          const pickable = prompt.kind === 'place' && prompt.candidates?.includes(place);
          return (
            <Group key={`${place}:${spot.ref}`} x={spot.pos[0]} y={spot.pos[1]} rotation={spot.rot}>
              <Rect
                name="prompt-place"
                listening={pickable}
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                cornerRadius={Math.min(w, h) / 8}
                stroke={chosen ? '#2f81f7' : GOLD}
                strokeWidth={(chosen ? 3 : 2) / scale}
                fill={chosen ? 'rgba(47,129,247,0.25)' : 'rgba(227,179,65,0.12)'}
                onClick={() => clickForPrompt(place, 'place')}
                onTap={() => clickForPrompt(place, 'place')}
              />
            </Group>
          );
        }),
      )}
    </Group>
  );
}

/** The spots a place names: one spot, or every spot of a drop area. */
function spotsOf(spots: readonly SnapSpot[], place: string): SnapSpot[] {
  return spots.filter((s) => s.ref === place || `${s.owner}/${s.target}` === place);
}
