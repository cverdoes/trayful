import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectRepository,
  waitingForRepository,
  type RepositoryStatus,
} from '../../src/repository/api';
import { summary, tone, useRepository } from '../../src/repository/store';

const SYNCED: RepositoryStatus = {
  connected: true,
  url: 'https://github.com/me/game',
  branch: 'main',
  path: 'prototype',
  unpushed: 0,
  behind: 0,
  changed: [],
};

/** Answers for the server's routes, by path; a route answers 200 unless it gives a status. */
let routes: Record<string, { body: unknown; status?: number }>;
let sent: { url: string; method: string; body?: unknown }[];

beforeEach(() => {
  routes = {};
  sent = [];
  useRepository.setState({ status: undefined, busy: false, error: undefined });
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    sent.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes[url];
    if (!route) return Promise.reject(new Error(`No route for ${url}`));
    return Promise.resolve(
      new Response(JSON.stringify(route.body), { status: route.status ?? 200 }),
    );
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the repository store', () => {
  it('loads where things stand, and nothing for a Trayful on a folder', async () => {
    routes['/api/repository'] = { body: SYNCED };
    await useRepository.getState().refresh();
    expect(useRepository.getState().status).toEqual(SYNCED);
    routes['/api/repository'] = { body: { error: 'Not found' }, status: 404 };
    await useRepository.getState().refresh();
    expect(useRepository.getState().status).toBeUndefined();
  });

  it('keeps what it showed while the server cannot be reached', async () => {
    useRepository.setState({ status: SYNCED });
    await useRepository.getState().refresh();
    expect(useRepository.getState().status).toEqual(SYNCED);
  });

  it('syncs and takes the repository version, saying why when that fails', async () => {
    routes['/api/repository/sync'] = { body: { ...SYNCED, unpushed: 0 } };
    await useRepository.getState().sync();
    expect(sent.at(-1)).toEqual({ url: '/api/repository/sync', method: 'POST', body: {} });
    expect(useRepository.getState()).toMatchObject({ status: SYNCED, busy: false });
    routes['/api/repository/resolve'] = { body: { error: 'There is no conflict.' }, status: 400 };
    await useRepository.getState().takeRepositoryVersion();
    expect(useRepository.getState()).toMatchObject({ error: 'There is no conflict.', busy: false });
  });

  it('connects with what the host typed', async () => {
    routes['/api/repository/connect'] = { body: SYNCED };
    await connectRepository({ url: 'https://github.com/me/game', branch: 'main', path: '' });
    expect(sent.at(-1)?.body).toEqual({
      url: 'https://github.com/me/game',
      branch: 'main',
      path: '',
    });
  });

  it('knows when the server waits for a repository', async () => {
    expect(await waitingForRepository()).toBe(false);
    routes['/api/health'] = { body: { ok: true, waiting: true } };
    expect(await waitingForRepository()).toBe(true);
  });
});

describe('how the repository stands, in words and colour', () => {
  it('is in sync with nothing waiting', () => {
    expect(summary(SYNCED)).toBe('In sync');
    expect(tone(SYNCED)).toBe('synced');
  });

  it('counts what waits to be committed, pushed and taken in', () => {
    const waiting = { ...SYNCED, changed: ['a', 'b'], unpushed: 1, behind: 3 };
    expect(summary(waiting)).toBe(
      '2 changes not committed, 1 commit not pushed, 3 commits to take in',
    );
    expect(tone(waiting)).toBe('pending');
  });

  it('puts a conflict or a failed sync first', () => {
    const conflict = { ...SYNCED, conflict: { branch: 'trayful/conflict-1', files: ['a'] } };
    expect(summary(conflict)).toBe('Conflict with the repository');
    expect(tone(conflict)).toBe('trouble');
    const failed = { ...SYNCED, lastError: 'git push failed' };
    expect(summary(failed)).toBe('The last sync failed');
    expect(tone(failed)).toBe('trouble');
  });
});
