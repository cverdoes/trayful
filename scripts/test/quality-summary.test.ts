import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  complexityLinter,
  coverageByPackage,
  coverageCell,
  emptyCoverage,
  floorsByPackage,
  readScores,
  testsByPackage,
} from '../quality-summary.js';

const root = fileURLToPath(new URL('../..', import.meta.url));

const coverage = (covered: number, total: number) => {
  const c = emptyCoverage();
  c.lines = { covered, total };
  return c;
};

describe('coverageByPackage', () => {
  it('adds up files per package and skips the total', () => {
    const rows = coverageByPackage({
      total: coverage(9, 30),
      '/repo/packages/core/src/a.ts': coverage(1, 10),
      '/repo/packages/core/src/b.ts': coverage(3, 10),
      '/repo/packages/app/src/c.tsx': coverage(5, 10),
    });
    expect(rows.map(([name, c]) => [name, c.lines])).toEqual([
      ['app', { covered: 5, total: 10 }],
      ['core', { covered: 4, total: 20 }],
    ]);
  });
});

describe('floorsByPackage', () => {
  it("reads each package's floors and skips other thresholds", () => {
    const floors = floorsByPackage({
      autoUpdate: () => 0,
      'packages/core/src/**': { lines: 96, branches: 90 },
      'scripts/**': { lines: 50 },
    });
    expect([...floors]).toEqual([['core', { lines: 96, branches: 90 }]]);
  });
});

describe('coverageCell', () => {
  it('shows the floor next to the measured coverage', () => {
    expect(coverageCell({ covered: 97, total: 100 }, 96)).toBe('97.0% / 96%');
  });

  it('marks coverage under its floor', () => {
    expect(coverageCell({ covered: 90, total: 100 }, 96)).toBe('90.0% / 96% ❌');
  });

  it('shows only the coverage when there is no floor', () => {
    expect(coverageCell({ covered: 1, total: 4 }, undefined)).toBe('25.0%');
  });
});

describe('testsByPackage', () => {
  it('counts files and tests by outcome per package, and puts the rest under scripts', () => {
    const file = (name: string, ...statuses: string[]) => ({
      name,
      assertionResults: statuses.map((status) => ({ status })),
    });
    const rows = testsByPackage([
      file('/repo/packages/core/test/a.test.ts', 'passed', 'failed'),
      file('/repo/packages/core/test/b.test.ts', 'passed', 'skipped', 'todo'),
      file('/repo/scripts/test/c.test.ts', 'passed'),
    ]);
    expect(rows).toEqual([
      ['core', { files: 2, passed: 2, failed: 1, skipped: 2 }],
      ['scripts', { files: 1, passed: 1, failed: 0, skipped: 0 }],
    ]);
  });
});

describe('readScores', () => {
  // Fails when a sonarjs upgrade changes the rule's message, in the upgrade's own PR.
  it("reads each function's cognitive complexity from the sonarjs rule", async () => {
    const code = [
      'export function simple() {',
      '  return 1;',
      '}',
      'export function branchy(a: boolean, b: boolean) {',
      '  if (a) {',
      '    if (b) return 1;',
      '  }',
      '  return 0;',
      '}',
    ].join('\n');
    const filePath = path.join(root, 'packages/core/src/example.ts');
    const results = await complexityLinter().lintText(code, { filePath });
    expect(readScores(results)).toEqual([{ score: 3, where: 'packages/core/src/example.ts:4' }]);
  });

  it('throws on a message it cannot read', () => {
    const result = {
      filePath: path.join(root, 'x.ts'),
      messages: [{ ruleId: 'sonarjs/cognitive-complexity', message: 'reworded', line: 1 }],
    };
    expect(() => readScores([result] as never)).toThrow('Unexpected ESLint message');
  });
});
