import type { ProjectView, ServerMessage } from '@trayful/core';
import { useStore } from './store';

/** Connects to the Trayful server, loading the project and keeping the table in sync. Reconnects on loss. */
export function connect(): void {
  void loadView();
  open(0);
}

async function loadView(): Promise<void> {
  const response = await fetch('/api/project');
  useStore.setState({ view: (await response.json()) as ProjectView });
}

function open(attempt: number): void {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${location.host}/ws`);
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
    useStore.getState().receive(JSON.parse(String(event.data)) as ServerMessage);
  });
  socket.addEventListener('close', () => {
    useStore.setState({ status: 'offline', send: () => {} });
    const delay = Math.min(5000, 250 * 2 ** attempt);
    setTimeout(() => open(attempt + 1), delay);
  });
}
