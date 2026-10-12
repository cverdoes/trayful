// Starts a Trayful server on a scratch copy of the example project for the end-to-end tests.
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '@trayful/server';

const dir = path.join(await mkdtemp(path.join(tmpdir(), 'trayful-e2e-')), 'harvest-moon');
await cp(new URL('../examples/harvest-moon', import.meta.url), dir, {
  recursive: true,
  filter: (src) => path.basename(src) !== 'tables',
});
const server = await startServer({
  projectDir: dir,
  port: Number(process.env.E2E_PORT ?? 4399),
  seed: 1,
});
console.log(`e2e server at ${server.url} using ${dir}`);
