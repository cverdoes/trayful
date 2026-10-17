import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';
import { version } from './version.js';

describe('version', () => {
  it("is the cli package's version in this repository", async () => {
    const lines: string[] = [];
    expect(await run(['--version'], (s) => lines.push(s))).toBe(0);
    expect(lines).toEqual([version()]);
    expect(version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('is read from the package.json beside a packaged Trayful', () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'trayful-dist-'));
    writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    expect(version(pathToFileURL(path.join(dist, 'trayful.mjs')).href)).toBe('1.2.3');
  });
});
