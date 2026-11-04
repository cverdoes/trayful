import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { packagedVersion, resourceDir } from './resources.js';

describe('resourceDir', () => {
  it('finds each resource in this repository', () => {
    expect(existsSync(path.join(resourceDir('app'), '..', 'vite.config.ts'))).toBe(true);
    expect(existsSync(path.join(resourceDir('starter'), 'trayful.yaml'))).toBe(true);
    expect(existsSync(path.join(resourceDir('schemas'), 'manifest.schema.json'))).toBe(true);
    expect(existsSync(path.join(resourceDir('docs'), 'README.md'))).toBe(true);
    expect(existsSync(path.join(resourceDir('skill'), 'SKILL.md'))).toBe(true);
  });

  it('prefers the resources folder beside a packaged Trayful', () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'trayful-dist-'));
    mkdirSync(path.join(dist, 'resources', 'starter'), { recursive: true });
    const bundle = pathToFileURL(path.join(dist, 'trayful.mjs')).href;
    expect(resourceDir('starter', bundle)).toBe(path.join(dist, 'resources', 'starter'));
  });
});

describe('packagedVersion', () => {
  it('is nothing in this repository', () => {
    expect(packagedVersion()).toBeUndefined();
  });

  it('reads the package.json beside a packaged Trayful', () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), 'trayful-dist-'));
    writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    expect(packagedVersion(pathToFileURL(path.join(dist, 'trayful.mjs')).href)).toBe('0.4.0');
  });
});
