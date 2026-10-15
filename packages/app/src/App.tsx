import { useEffect } from 'react';
import { Help } from './Help';
import { useKeyboard } from './keyboard';
import { Activity, ErrorToast, Problems } from './Notices';
import { InviteDialog } from './Invite';
import { Designer } from './design/Designer';
import { ClosedScreen, HandTray, JoinScreen } from './Players';
import { Print } from './Print';
import { RenderJob } from './render/Preview';
import { route } from './route';
import { useStore } from './store';
import { Table } from './Table';
import { Toolbar } from './Toolbar';

export function App() {
  useTestHook();
  const fatal = useStore((s) => s.fatal);
  const gate = useStore((s) => s.gate);
  if (fatal) return <div className="loading">{fatal}</div>;
  if (gate === 'closed') return <ClosedScreen />;
  if (gate === 'join') return <JoinScreen />;
  return <Page />;
}

/** The page the address asks for: the print sheets, design mode, or the table. */
function Page() {
  const { print, design } = route();
  if (print) return <Print />;
  if (design) return <Designer />;
  return <TableApp />;
}

function TableApp() {
  useKeyboard();
  const helpOpen = useStore((s) => s.helpOpen);
  const inviteOpen = useStore((s) => s.inviteOpen);
  return (
    <>
      <Table />
      <Toolbar />
      <HandTray />
      {inviteOpen && <InviteDialog />}
      <Problems />
      <ErrorToast />
      <Activity />
      <RenderJob />
      {helpOpen && <Help />}
    </>
  );
}

declare global {
  interface Window {
    /** Lets end-to-end tests read state and find pieces on screen. */
    __trayful?: {
      store: typeof useStore;
      worldToScreen: (x: number, y: number) => { x: number; y: number };
      /** In design mode: where a point on a face, in millimetres, is on the page. */
      faceToScreen?: (side: 'front' | 'back', x: number, y: number) => { x: number; y: number };
    };
  }
}

function useTestHook() {
  useEffect(() => {
    window.__trayful = {
      store: useStore,
      worldToScreen: (x, y) => {
        const { viewport: v } = useStore.getState();
        return { x: v.x + x * v.scale, y: v.y + y * v.scale };
      },
    };
  }, []);
}
