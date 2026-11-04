import { saveHandMinimized } from './handTray';
import { useStore } from './store';

/** Data a hand card carries while dragged onto the table. */
export const HAND_DRAG = 'application/x-trayful-hand';

/** The id of the player this browser plays as. */
export function myId(): string | undefined {
  return useStore.getState().me?.player?.id;
}

/** Whether a screen point lies over the hand tray. */
export function overHandTray(clientX: number, clientY: number): boolean {
  const tray = document.querySelector('.hand-tray')?.getBoundingClientRect();
  return (
    !!tray &&
    clientX >= tray.left &&
    clientX <= tray.right &&
    clientY >= tray.top &&
    clientY <= tray.bottom
  );
}

/** How much of the bottom of the screen the hand tray covers, in pixels; none while it is a bubble. */
export function handTrayHeight(): number {
  const { handMinimized, handHeight } = useStore.getState();
  return handMinimized ? 0 : handHeight;
}

/** Shrinks the hand tray to a bubble in the corner, or opens it again, and remembers which. */
export function toggleHandTray(): void {
  const handMinimized = !useStore.getState().handMinimized;
  useStore.setState({ handMinimized });
  saveHandMinimized(handMinimized);
}
