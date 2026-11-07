import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, join, start } from '../src/connection';
import { dropWhileOffline, useStore } from '../src/store';

/** Makes the next snapshot fail, as when the table is not drawn. */
let snapshotFails = false;
vi.mock('../src/snapshot', () => ({
  snapshotTable: () => {
    if (snapshotFails) throw new Error('The table is not on screen.');
    return 'data:image/png;base64,AAAA';
  },
}));

/** A stand-in for the browser's WebSocket that the test opens, feeds and closes. */
class FakeSocket {
  static readonly opened: FakeSocket[] = [];
  readonly sent: unknown[] = [];
  private readonly listeners = new Map<string, ((event: { data?: string }) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  emit(type: 'open' | 'close' | 'message', data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: data === undefined ? undefined : JSON.stringify(data) });
    }
  }
}

const latest = () => FakeSocket.opened.at(-1)!;

/** Answers for the server's routes, by path; a route answers 200 unless it gives a status. */
let routes: Record<string, { body: unknown; status?: number }>;
let requests: { url: string; body?: unknown }[];
let address: string;

const initial = useStore.getState();

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.opened.length = 0;
  snapshotFails = false;
  requests = [];
  address = '?project=game';
  routes = {
    '/api/me': { body: { host: true, invited: false, joined: true, player: { id: 'alice' } } },
    '/api/project?project=game': { body: { project: 'game', types: {} } },
    '/api/join': { body: {} },
  };
  useStore.setState({ ...initial }, true);
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', {
    protocol: 'http:',
    host: 'localhost:4321',
    pathname: '/',
    get search() {
      return address;
    },
  });
  vi.stubGlobal('history', {
    replaceState: (_state: unknown, _title: string, url: string) => {
      const query = url.indexOf('?');
      address = query === -1 ? '' : url.slice(query);
    },
  });
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    requests.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`No route for ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), { status: route.status ?? 200 }),
    );
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets the fetches already on their way answer. */
const answered = () => vi.advanceTimersByTimeAsync(0);

describe('start', () => {
  it('connects someone who plays at this table, and loads the project', async () => {
    await start();
    await answered();
    expect(useStore.getState().me?.player?.id).toBe('alice');
    expect(latest().url).toBe('ws://localhost:4321/ws?project=game');
    expect(useStore.getState().view).toEqual({ project: 'game', types: {} });
  });

  it('keeps out someone who was not invited', async () => {
    routes['/api/me'] = { body: { host: false, invited: false, joined: false } };
    await start();
    expect(useStore.getState().gate).toBe('closed');
    expect(FakeSocket.opened).toEqual([]);
  });

  it('asks someone with an invite for a name before connecting', async () => {
    routes['/api/me'] = { body: { host: false, invited: true, joined: false } };
    await start();
    expect(useStore.getState().gate).toBe('join');
    expect(FakeSocket.opened).toEqual([]);
  });

  it('drops the join link from the address of someone who already joined', async () => {
    address = '?project=game&join';
    await start();
    expect(address).toBe('?project=game');
    expect(FakeSocket.opened).toHaveLength(1);
  });

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    await start();
    expect(useStore.getState().fatal).toBe('Could not reach the Trayful server.');
  });

  it("shows the server's reason when the project cannot be loaded", async () => {
    routes['/api/project?project=game'] = { body: { error: 'No project "game".' }, status: 404 };
    await start();
    await answered();
    expect(useStore.getState().fatal).toBe('No project "game".');
  });
});

describe('join', () => {
  it('joins under a name, then connects', async () => {
    address = '?project=game&join';
    useStore.setState({ gate: 'join' });
    await join('Alice');
    expect(requests[0]).toEqual({ url: '/api/join', body: { name: 'Alice' } });
    expect(useStore.getState().gate).toBeUndefined();
    expect(address).toBe('?project=game');
    expect(FakeSocket.opened).toHaveLength(1);
  });

  it("throws the server's reason when it refuses the name", async () => {
    routes['/api/join'] = { body: { error: 'That name is taken.' }, status: 409 };
    await expect(join('Bob')).rejects.toThrow('That name is taken.');
    expect(FakeSocket.opened).toEqual([]);
  });
});

describe('connect', () => {
  it('goes online when the socket opens, and sends over it', () => {
    connect();
    expect(useStore.getState().status).toBe('connecting');
    latest().emit('open');
    expect(useStore.getState().status).toBe('online');
    useStore.getState().command({ type: 'undo' } as never);
    expect(latest().sent).toEqual([{ type: 'command', command: { type: 'undo' } }]);
  });

  it('passes what the server sends to the store', () => {
    const receive = vi.fn();
    useStore.setState({ receive });
    connect();
    latest().emit('message', { type: 'players', players: [] });
    expect(receive).toHaveBeenCalledWith({ type: 'players', players: [] });
  });

  it('answers an agent asking to see the table with a snapshot, or why there is none', async () => {
    connect();
    latest().emit('message', { type: 'snapshot-request', id: 's1' });
    expect(latest().sent).toEqual([]);
    await vi.runOnlyPendingTimersAsync();
    snapshotFails = true;
    latest().emit('message', { type: 'snapshot-request', id: 's2' });
    await vi.runOnlyPendingTimersAsync();
    expect(latest().sent).toEqual([
      { type: 'snapshot', id: 's1', png: 'data:image/png;base64,AAAA' },
      { type: 'snapshot', id: 's2', error: 'The table is not on screen.' },
    ]);
  });

  it('hands an agent asking to see a component to the render job', () => {
    connect();
    latest().emit('message', { type: 'render-request', id: 'r1', component: 'card' });
    expect(useStore.getState().renderJob).toEqual({ id: 'r1', component: 'card' });
  });

  it('goes offline when the socket closes, and tries again later and later', async () => {
    connect();
    latest().emit('close');
    expect(useStore.getState().status).toBe('offline');
    expect(useStore.getState().send).toBe(dropWhileOffline);
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeSocket.opened).toHaveLength(2);
    latest().emit('close');
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeSocket.opened).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(250);
    expect(FakeSocket.opened).toHaveLength(3);
  });
});
