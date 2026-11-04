// Helpers for the CLI's tests.
import { chmod, cp, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const examples = fileURLToPath(new URL('../../../examples', import.meta.url));

/** A copy of the Harvest Moon example without its saved tables, to play on. */
export function scratchProject(): Promise<string> {
  return scratchCopy(path.join(examples, 'harvest-moon'));
}

/** A copy of the Harvest Moon example as it was written in the first file format. */
export function scratchLegacyProject(): Promise<string> {
  return scratchCopy(
    fileURLToPath(new URL('../../formats/fixtures/legacy-harvest-moon', import.meta.url)),
  );
}

/** A copy of the examples folder, a folder of projects, without saved tables. */
export function scratchExamples(): Promise<string> {
  return scratchCopy(examples);
}

async function scratchCopy(source: string): Promise<string> {
  const dir = path.join(
    await mkdtemp(path.join(os.tmpdir(), 'trayful-cli-')),
    path.basename(source),
  );
  await cp(source, dir, { recursive: true, filter: (src) => path.basename(src) !== 'tables' });
  return dir;
}

/** A stand-in for cloudflared: a Node script that prints what the real one does, then waits. */
export async function fakeCloudflared(script: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'trayful-tunnel-'));
  const file = path.join(dir, 'cloudflared');
  await writeFile(file, `#!/usr/bin/env node\n${script}\n`);
  await chmod(file, 0o755);
  return file;
}
