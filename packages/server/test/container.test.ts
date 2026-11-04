import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { containerGateway } from './container.js';
import { startServer, type RunningServer } from './server.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'trayful-container-'));
}

describe('containerGateway', () => {
  it('reads the default route from the routing table', async () => {
    const routes = path.join(await tempDir(), 'route');
    await writeFile(
      routes,
      [
        'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask',
        'eth0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF',
        'eth0\t00000000\t010011AC\t0003\t0\t0\t0\t00000000',
      ].join('\n'),
    );
    expect(containerGateway(routes)).toBe('172.17.0.1');
  });

  it('finds nothing without a default route or a routing table', async () => {
    const dir = await tempDir();
    const routes = path.join(dir, 'route');
    await writeFile(routes, 'Iface\tDestination\tGateway\neth0\t000011AC\t00000000\n');
    expect(containerGateway(routes)).toBeUndefined();
    expect(containerGateway(path.join(dir, 'missing'))).toBeUndefined();
  });
});

describe('a server in a container', () => {
  let server: RunningServer | undefined;
  afterEach(async () => {
    await server?.close();
  });

  it('treats the computer running it as the host, and no one else', async () => {
    const dir = await tempDir();
    await cp(example, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
    server = await startServer({
      projectDir: dir,
      port: 0,
      appDir: path.join(dir, 'no-app'),
      container: { hostAddresses: ['172.17.0.1'] },
    });
    const invite = (remoteAddress: string, host = 'localhost:4317') =>
      server!.app.inject({
        method: 'POST',
        url: '/api/invites',
        remoteAddress,
        headers: { host },
        payload: {},
      });
    expect((await invite('172.17.0.1')).statusCode).toBe(200);
    expect((await invite('::ffff:172.17.0.1')).statusCode).toBe(200);
    // Another container on the same network is not the host.
    expect((await invite('172.17.0.3')).statusCode).toBe(403);
    // Nor is a website pointing its own name at this computer.
    expect((await invite('172.17.0.1', 'evil.example:4317')).statusCode).toBe(403);
    // The container's own addresses are no use to others, so no network invite links.
    expect(server.shareBases).toEqual([]);
  });
});
