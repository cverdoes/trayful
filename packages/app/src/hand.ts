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
