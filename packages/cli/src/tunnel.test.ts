import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startTunnel } from './tunnel.js';

/** A stand-in for cloudflared that prints what the real one does, then waits. */
async function fakeCloudflared(script: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-tunnel-'));
  const file = path.join(dir, 'cloudflared');
  await writeFile(file, `#!/usr/bin/env node\n${script}\n`);
  await chmod(file, 0o755);
  return file;
}

describe.skipIf(process.platform === 'win32')('startTunnel', () => {
  it('reads the quick tunnel address from cloudflared', async () => {
    const command = await fakeCloudflared(`
      if (process.argv.slice(2).join(' ') !== 'tunnel --url http://127.0.0.1:4317 --no-autoupdate') process.exit(3);
      console.error('INF Requesting new quick Tunnel on trycloudflare.com...');
      console.error('INF |  https://api.trycloudflare.com is not it');
      setTimeout(() => console.error('INF |  https://brave-little-moon.trycloudflare.com  |'), 50);
      setInterval(() => {}, 1000);
    `);
    const tunnel = await startTunnel(4317, { command });
    expect(tunnel.url).toBe('https://brave-little-moon.trycloudflare.com');
    tunnel.close();
  });

  it('explains a missing cloudflared and one that stops early', async () => {
    await expect(startTunnel(4317, { command: '/nonexistent/cloudflared' })).rejects.toThrow(
      /needs cloudflared/,
    );
    const command = await fakeCloudflared(
      `console.error('ERR failed to connect'); process.exit(1);`,
    );
    await expect(startTunnel(4317, { command })).rejects.toThrow(
      /stopped \(exit code 1\)[\s\S]*failed to connect/,
    );
  });
});
