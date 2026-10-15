import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectLoadError, startServer } from '@trayful/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { parsePlayArgs } from './options.js';
import { play } from './play.js';
import { fakeCloudflared, scratchExamples, scratchProject } from './testing.js';
import { TunnelError } from './tunnel.js';

let appDir: string;

beforeAll(async () => {
  appDir = await mkdtemp(path.join(os.tmpdir(), 'trayful-app-'));
  await writeFile(path.join(appDir, 'index.html'), '<!doctype html><title>Trayful</title>');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Plays with the given arguments until it is told to stop, then returns what it printed. */
async function playUntilStopped(args: string[]): Promise<string> {
  const lines: string[] = [];
  let url = '';
  const out = (s: string) => {
    lines.push(s);
    url ||= /on the table at (\S+)/.exec(s)?.[1] ?? '';
  };
  // While it serves, the table answers in the browser.
  const stopped = async () => expect((await fetch(url)).ok).toBe(true);
  expect(
    await play(parsePlayArgs([...args, '--port', '0', '--no-open']), out, { appDir, stopped }),
  ).toBe(0);
  return lines.join('\n');
}

describe('trayful play', () => {
  it('serves the table until it is stopped', async () => {
    const dir = await scratchProject();
    const out = await playUntilStopped([dir, '--table', 'first']);
    expect(out).toMatch(/^Harvest Moon is on the table at http:\/\/127\.0\.0\.1:\d+\n/);
    // Outside the current folder, the table's file is given in full.
    expect(out).toContain(`Saving to ${path.join(dir, 'tables', 'first.json')}.`);
    expect(out).toContain('Press Ctrl+C to stop.');
    expect(out).toContain('Saving and stopping…');
    expect(out).not.toContain('Invite');
  });

  it('says how to switch projects in a folder of projects', async () => {
    const out = await playUntilStopped([await scratchExamples(), '--project', 'harvest-moon']);
    expect(out).toContain('2 projects in this folder; switch between them in the browser.');
  });

  it('prints invite links when sharing on the network', async () => {
    const out = await playUntilStopped([await scratchProject(), '--share']);
    expect(out).toContain('Invite others to table-1 with a link');
    expect(out).toMatch(/ {2}http:\/\/.+\/join\/\S+/);
  });

  it.skipIf(process.platform === 'win32')('adds a tunnel address to the invite links', async () => {
    vi.stubEnv(
      'TRAYFUL_CLOUDFLARED',
      await fakeCloudflared(`
        console.error('INF |  https://brave-little-moon.trycloudflare.com  |');
        setInterval(vi.fn(), 1000);
      `),
    );
    const out = await playUntilStopped([await scratchProject(), '--tunnel']);
    expect(out).toContain('Opening a tunnel…');
    expect(out).toMatch(/ {2}https:\/\/brave-little-moon\.trycloudflare\.com\/join\/\S+/);
  });

  it('stops the server when the tunnel cannot open', async () => {
    vi.stubEnv('TRAYFUL_CLOUDFLARED', '/nonexistent/cloudflared');
    const options = parsePlayArgs([await scratchProject(), '--port', '0', '--tunnel']);
    await expect(play(options, vi.fn(), { appDir })).rejects.toThrow(TunnelError);
  });

  it('checks that the app is served, then exits, in a smoke test', async () => {
    vi.stubEnv('TRAYFUL_SMOKE_TEST', '1');
    const lines: string[] = [];
    const options = parsePlayArgs([await scratchProject(), '--port', '0']);
    expect(await play(options, (s) => lines.push(s), { appDir })).toBe(0);
    expect(lines.at(-1)).toBe('Smoke test passed.');
  });

  it('explains a port in use, a missing app and a broken project', async () => {
    const dir = await scratchProject();
    const running = await startServer({ projectDir: dir, port: 0, appDir, watch: false });
    try {
      const port = new URL(running.url).port;
      await expect(play(parsePlayArgs([dir, '--port', port]), vi.fn(), { appDir })).rejects.toThrow(
        `Port ${port} is in use. Is Trayful already running? Try --port <n>.`,
      );
    } finally {
      await running.close();
    }
    await expect(play(parsePlayArgs([dir]), vi.fn(), { appDir: '/nonexistent' })).rejects.toThrow(
      'The browser app has not been built yet.',
    );
    const notAProject = fileURLToPath(new URL('.', import.meta.url));
    await expect(
      play(parsePlayArgs([notAProject, '--port', '0']), vi.fn(), { appDir }),
    ).rejects.toThrow(ProjectLoadError);
  });
});
