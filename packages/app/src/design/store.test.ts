import { TYPE_PRESETS, type ComponentType } from '@trayful/formats/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import type { Library } from './api';
import {
  createType,
  duplicateType,
  openType,
  projectChanged,
  saveDraft,
  setValue,
  settle,
  useDesign,
} from './store';

const card: ComponentType = { id: 'card', is: 'piece', size: [63, 88] };
const FILE = 'library/cards.yaml';

interface Sent {
  definition: ComponentType;
  baseHash?: string;
  file?: string;
}

/**
 * A stand-in for the server's authoring routes. The file's version goes up with
 * every save, and a save made against an older version is refused, as the server
 * does. `hold` keeps the next save on its way until `release` is called.
 */
function fakeServer() {
  const server = {
    version: 1,
    sent: [] as Sent[],
    held: undefined as (() => void) | undefined,
    hold: false,
    library(): Library {
      return { files: { [FILE]: `v${server.version}` }, types: { card: FILE } };
    },
    release() {
      server.held?.();
    },
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.startsWith('/api/library')) return reply(server.library());
    if (url.startsWith('/api/components')) return reply([]);
    const body = JSON.parse(init!.body as string) as Sent;
    server.sent.push(body);
    if (server.hold) {
      server.hold = false;
      await new Promise<void>((resolve) => (server.held = resolve));
    }
    if (body.baseHash && body.baseHash !== `v${server.version}`) {
      return reply({ error: `${FILE} changed` }, 409);
    }
    server.version++;
    return reply(server.library());
  });
  return server;
}

let server: ReturnType<typeof fakeServer>;
const initial = useDesign.getState();

beforeEach(() => {
  vi.useFakeTimers();
  server = fakeServer();
  useDesign.setState({ ...initial, library: server.library() }, true);
  useStore.setState({
    view: { project: 'game', types: { card } } as unknown as ReturnType<
      typeof useStore.getState
    >['view'],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('editing a type', () => {
  it('saves a valid change shortly after, against the version it started from', async () => {
    openType(card);
    setValue(['face', 'corner'])(3);
    expect(useDesign.getState().status).toBe('unsaved');
    await vi.runAllTimersAsync();
    expect(server.sent).toEqual([
      { definition: { ...card, face: { corner: 3 } }, baseHash: 'v1', file: FILE },
    ]);
    expect(useDesign.getState()).toMatchObject({
      status: 'saved',
      saved: { face: { corner: 3 } },
      baseHash: 'v2',
    });
  });

  it('does not save a type with problems', async () => {
    openType(card);
    setValue(['face', 'corner'])(-1);
    expect(useDesign.getState().status).toBe('invalid');
    expect(useDesign.getState().problems[0]?.path).toEqual(['face', 'corner']);
    await vi.runAllTimersAsync();
    expect(server.sent).toHaveLength(0);
  });

  it('saves nothing when nothing changed', async () => {
    openType(card);
    await saveDraft();
    expect(server.sent).toHaveLength(0);
  });

  it('saves changes made during a save after it, not alongside it', async () => {
    openType(card);
    server.hold = true;
    setValue(['face', 'corner'])(3);
    await vi.advanceTimersByTimeAsync(1000);
    setValue(['face', 'corner'])(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.sent).toHaveLength(1);
    server.release();
    await vi.runAllTimersAsync();
    expect(server.sent.map((s) => [s.definition.face?.corner, s.baseHash])).toEqual([
      [3, 'v1'],
      [4, 'v2'],
    ]);
    expect(useDesign.getState().status).toBe('saved');
  });
});

describe('a file changed by someone else', () => {
  it('is not overwritten by unsaved changes, even after the designer hears of it', async () => {
    openType(card);
    setValue(['face', 'corner'])(3);
    server.version++;
    await projectChanged({ card: { ...card, face: { corner: 9 } } });
    await vi.runAllTimersAsync();
    expect(useDesign.getState()).toMatchObject({
      status: 'conflict',
      message: `${FILE} changed`,
      draft: { face: { corner: 3 } },
    });
  });

  it('is shown when there is nothing unsaved', async () => {
    openType(card);
    server.version++;
    await projectChanged({ card: { ...card, face: { corner: 9 } } });
    expect(useDesign.getState()).toMatchObject({ draft: { face: { corner: 9 } }, baseHash: 'v2' });
  });
});

describe('switching types', () => {
  it('saves the type shown first', async () => {
    openType(card);
    setValue(['face', 'corner'])(3);
    expect(await settle()).toBe(true);
    expect(server.sent).toHaveLength(1);
  });

  it('says when changes would be lost', async () => {
    openType(card);
    setValue(['face', 'corner'])(-1);
    expect(await settle()).toBe(false);
  });

  it('ignores a save that comes back after another type was opened', async () => {
    openType(card);
    server.hold = true;
    setValue(['face', 'corner'])(3);
    await vi.advanceTimersByTimeAsync(1000);
    const token: ComponentType = { id: 'token', is: 'piece', size: 20 };
    openType(token);
    server.release();
    await vi.runAllTimersAsync();
    expect(useDesign.getState()).toMatchObject({ draft: token, saved: token, status: 'saved' });
  });
});

describe('new types', () => {
  it('start from a preset under a free id, and are saved as new', async () => {
    await createType(TYPE_PRESETS[0]!.type, 'Card');
    const [sent] = server.sent;
    expect(sent!.baseHash).toBeUndefined();
    expect(sent!.definition).toMatchObject({ id: 'card-2', name: 'Card', is: 'piece' });
    expect(Object.keys(sent!.definition).slice(0, 2)).toEqual(['id', 'name']);
    expect(useDesign.getState().status).toBe('saved');
  });

  it('copy the type shown into the same file', async () => {
    openType({ ...card, name: 'Action' });
    await duplicateType();
    expect(server.sent[0]).toMatchObject({
      definition: { id: 'action-copy', name: 'Action copy', size: [63, 88] },
      file: FILE,
    });
  });
});
