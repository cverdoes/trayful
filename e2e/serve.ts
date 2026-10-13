// Starts a Trayful server for the end-to-end tests on a scratch folder of projects:
// a copy of the example, which the tests play on, and a project made from the starter.
import { cp, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectFolder, startServer } from '@trayful/server';

const root = await mkdtemp(path.join(tmpdir(), 'trayful-e2e-'));
await cp(new URL('../examples/harvest-moon', import.meta.url), path.join(root, 'harvest-moon'), {
  recursive: true,
  filter: (src) => path.basename(src) !== 'tables',
});
await createProjectFolder(path.join(root, 'workshop'), 'Workshop');
const server = await startServer({
  projectDir: root,
  project: 'harvest-moon',
  port: Number(process.env.E2E_PORT ?? 4399),
  seed: 1,
});
console.log(`e2e server at ${server.url} using ${root}`);
