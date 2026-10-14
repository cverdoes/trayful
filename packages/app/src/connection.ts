import type { ProjectView, ServerMessage } from '@trayful/core';
import { forgetJoin, route, tableQuery } from './route';
import { snapshotTable } from './snapshot';
import { useStore, type Me } from './store';

/**
 * Finds out who this browser plays as, then connects; or, for someone who has
 * an invite but no name yet, waits for them to join first.
 */
export async function start(): Promise<void> {
  let me: Me;
  try {
    me = (await (await fetch('/api/me')).json()) as Me;
  } catch {
    useStore.setState({ fatal: 'Could not reach the Trayful server.' });
    return;
  }
  useStore.setState({ me });
  if (!me.host && !me.invited && !me.joined) useStore.setState({ gate: 'closed' });
  else if (!me.player || (route().join && !me.joined)) useStore.setState({ gate: 'join' });
  else {
    if (route().join) forgetJoin();
    connect();
  }
}

/** Joins the table under a name, then connects. */
export async function join(name: string): Promise<void> {
  const response = await fetch('/api/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? response.statusText);
  forgetJoin();
  useStore.setState({ gate: undefined });
  await start();
}

/** Connects to the Trayful server, loading the project and keeping the table in sync. Reconnects on loss. */
export function connect(): void {
  void loadView();
  open(0);
}

async function loadView(): Promise<void> {
  const response = await fetch(`/api/project${tableQuery()}`);
  if (!response.ok) {
    const { error } = (await response.json()) as { error: string };
    useStore.setState({ fatal: error });
    return;
  }
  useStore.setState({ view: (await response.json()) as ProjectView });
}

function open(attempt: number): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws${tableQuery()}`);
  useStore.setState({ status: 'connecting' });

  socket.addEventListener('open', () => {
    attempt = 0;
    // A restarted server counts revisions from zero again.
    useStore.setState({
      status: 'online',
      revision: -1,
      send: (m) => socket.send(JSON.stringify(m)),
    });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    if (message.type === 'snapshot-request') {
      // An agent asked to see the table.
      try {
        socket.send(JSON.stringify({ type: 'snapshot', id: message.id, png: snapshotTable() }));
      } catch (err) {
        socket.send(
          JSON.stringify({ type: 'snapshot', id: message.id, error: (err as Error).message }),
        );
      }
      return;
    }
    if (message.type === 'render-request') {
      // An agent asked to see a component; RenderJob draws it and answers.
      useStore.setState({ renderJob: { id: message.id, component: message.component } });
      return;
    }
    useStore.getState().receive(message);
  });
  socket.addEventListener('close', () => {
    useStore.setState({ status: 'offline', send: () => {} });
    const delay = Math.min(5000, 250 * 2 ** attempt);
    setTimeout(() => open(attempt + 1), delay);
  });
}
