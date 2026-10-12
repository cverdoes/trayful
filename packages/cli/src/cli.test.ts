import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from './index.js';

const example = fileURLToPath(new URL('../../../examples/harvest-moon', import.meta.url));

async function capture(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    args,
    (s) => out.push(s),
    (s) => err.push(s),
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('trayful CLI', () => {
  it('validates the example project', async () => {
    const r = await capture(['validate', example]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('✓ Harvest Moon: 6 types, 26 components, 1 deck, 1 setup');
  });

  it('prints JSON with --json', async () => {
    const r = await capture(['validate', example, '--json']);
    expect(JSON.parse(r.out)).toEqual({ ok: true, diagnostics: [] });
  });

  it('fails on a folder without a project', async () => {
    const r = await capture(['validate', fileURLToPath(new URL('.', import.meta.url))]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('trayful.yaml  error  File not found.');
  });

  it('shows help and rejects unknown commands', async () => {
    expect((await capture([])).out).toContain('Usage: trayful');
    expect((await capture(['frobnicate'])).code).toBe(2);
  });
});
