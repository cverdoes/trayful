import { CENTRE } from '@trayful/core';
import { useEffect } from 'react';
import { GroupPicker } from './table/GroupPicker';
import { Help } from './toolbar/Help';
import { useKeyboard } from './toolbar/keyboard';
import { Magnifier } from './table/Magnifier';
import { MarkDialog } from './table/MarkDialog';
import { Activity, ErrorToast, Problems } from './Notices';
import { InviteDialog } from './toolbar/Invite';
import { Designer } from './design/Designer';
import { ClosedScreen, HandTray, JoinScreen } from './Players';
import { Print } from './Print';
import { Prompts } from './Prompts';
import { RenderJob } from './render/Preview';
import { route } from './route';
import { useStore } from './store';
import { Table } from './table/Table';
import { pageOf } from './table/viewport';
import { Toolbar } from './toolbar/Toolbar';
import { UiPage } from './ui/UiPage';

export function App() {
  useTestHook();
  const fatal = useStore((s) => s.fatal);
  const gate = useStore((s) => s.gate);
  // The components page needs no table, so it shows whatever the connection says.
  if (route().ui) return <UiPage />;
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
      <GroupPicker />
      <MarkDialog />
      <Toolbar />
      <HandTray />
      <Prompts />
      {inviteOpen && <InviteDialog />}
      <Problems />
      <ErrorToast />
      <Activity />
      <RenderJob />
      <Magnifier />
      {helpOpen && <Help />}
    </>
  );
}

declare global {
  interface Window {
    /** Lets end-to-end tests read state and find pieces on screen. */
    __trayful?: {
      store: typeof useStore;
      /** Where a point on a surface (the Centre unless named) is on the page. */
      worldToScreen: (x: number, y: number, surface?: string) => { x: number; y: number };
      /** In design mode: where a point on a face, in millimetres, is on the page. */
      faceToScreen?: (side: 'front' | 'back', x: number, y: number) => { x: number; y: number };
    };
  }
}

function useTestHook() {
  useEffect(() => {
    window.__trayful = {
      store: useStore,
      worldToScreen: (x, y, surface = CENTRE) => {
        const [px, py] = pageOf(surface, [x, y]) ?? [Number.NaN, Number.NaN];
        return { x: px, y: py };
      },
    };
  }, []);
}
