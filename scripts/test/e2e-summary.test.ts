import { describe, expect, it } from 'vitest';
import { testsBySpecFile, type Suite } from '../e2e-summary.js';

const spec = (ok: boolean, ...statuses: string[]) => ({
  ok,
  tests: statuses.map((status) => ({ status })),
});

describe('testsBySpecFile', () => {
  it('counts the tests in each spec file, nested describes included', () => {
    const suites: Suite[] = [
      {
        file: 'table.spec.ts',
        specs: [spec(true, 'expected')],
        suites: [{ file: 'table.spec.ts', specs: [spec(false, 'unexpected')] }],
      },
      { file: 'agent.spec.ts', specs: [spec(true, 'skipped'), spec(true, 'flaky')] },
    ];
    expect(testsBySpecFile(suites)).toEqual([
      ['agent.spec.ts', { tests: 2, passed: 1, failed: 0, skipped: 1 }],
      ['table.spec.ts', { tests: 2, passed: 1, failed: 1, skipped: 0 }],
    ]);
  });
});
