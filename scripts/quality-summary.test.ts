import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  backlogByRule,
  complexityLinter,
  coverageByPackage,
  emptyCoverage,
  readScores,
} from './quality-summary.js';

const root = fileURLToPath(new URL('..', import.meta.url));

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

describe('backlogByRule', () => {
  it('counts suppressions per rule across files, most common first', () => {
    expect(
      backlogByRule({
        'a.ts': { 'max-params': { count: 1 }, 'max-lines': { count: 2 } },
        'b.ts': { 'max-params': { count: 2 } },
      }),
    ).toEqual([
      ['max-params', 3],
      ['max-lines', 2],
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
