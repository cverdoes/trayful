// Development mode: the Trayful server on a project plus the Vite dev server
// with hot reload for the browser app. Usage: pnpm dev [project-dir]
import { spawn } from 'node:child_process';
import path from 'node:path';
import { DEFAULT_PORT, startServer } from '@trayful/server';

const projectDir = path.resolve(process.argv[2] ?? 'examples/harvest-moon');
const server = await startServer({ projectDir, port: DEFAULT_PORT });
console.log(`Trayful server for ${server.session.project.manifest.name} at ${server.url}`);

const vite = spawn('pnpm', ['--filter', '@trayful/app', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, TRAYFUL_PORT: String(DEFAULT_PORT) },
});

async function stop() {
  vite.kill();
  await server.close();
  process.exit(0);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
vite.on('exit', () => void stop());
