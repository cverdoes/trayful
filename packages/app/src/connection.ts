import type { ProjectView, ServerMessage } from '@trayful/core';
import { tableQuery } from './route';
import { snapshotTable } from './snapshot';
import { useStore } from './store';

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
