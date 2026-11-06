/**
 * Prints a Markdown summary of the code quality numbers: tests and coverage per package
 * (against each package's coverage floor), the most complex functions and duplication.
 * In GitHub Actions it also appends the summary to the run's page ($GITHUB_STEP_SUMMARY).
 *
 * Run after `pnpm test:coverage` and `pnpm quality`, which write the reports it reads.
 */
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import { COGNITIVE_COMPLEXITY_LIMIT } from '../eslint.config.js';
import vitestConfig from '../vitest.config.js';

const root = path.resolve(import.meta.dirname, '..');
const TOP_FUNCTIONS = 10;

interface Metric {
  total: number;
  covered: number;
}
const METRICS = ['lines', 'statements', 'functions', 'branches'] as const;
type MetricName = (typeof METRICS)[number];
type FileCoverage = Record<MetricName, Metric>;
type Floors = Partial<Record<MetricName, number>>;

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path.join(root, file), 'utf8')) as T;
  } catch {
    return undefined;
  }
}

const pct = (m: Metric) => (m.total === 0 ? '–' : `${((100 * m.covered) / m.total).toFixed(1)}%`);

function addMetrics(into: FileCoverage, from: FileCoverage) {
  for (const key of Object.keys(into) as (keyof FileCoverage)[]) {
    into[key].total += from[key].total;
    into[key].covered += from[key].covered;
  }
}

export const emptyCoverage = (): FileCoverage => ({
  lines: { total: 0, covered: 0 },
  statements: { total: 0, covered: 0 },
  functions: { total: 0, covered: 0 },
  branches: { total: 0, covered: 0 },
});

/** The workspace package a file belongs to, or undefined outside packages/. */
const packageOf = (file: string) => /packages\/([^/]+)\//.exec(file)?.[1];

/** Adds up per-file coverage into one entry per workspace package, sorted by name. */
export function coverageByPackage(summary: Record<string, FileCoverage>) {
  const byPackage = new Map<string, FileCoverage>();
  for (const [file, coverage] of Object.entries(summary)) {
    const name = packageOf(file);
    if (!name) continue;
    const total = byPackage.get(name) ?? emptyCoverage();
    byPackage.set(name, total);
    addMetrics(total, coverage);
  }
  return [...byPackage].sort(([a], [b]) => a.localeCompare(b));
}

/** The coverage floor of each package, from the `packages/<name>/src/**` thresholds. */
export function floorsByPackage(thresholds: object): Map<string, Floors> {
  const floors = new Map<string, Floors>();
  for (const [glob, value] of Object.entries(thresholds as Record<string, unknown>)) {
    const name = /^packages\/([^/]+)\/src\/\*\*$/.exec(glob)?.[1];
    if (name && typeof value === 'object' && value) floors.set(name, value);
  }
  return floors;
}

/** A coverage cell: the measured percentage, its floor, and a cross when it is under. */
export function coverageCell(m: Metric, floor: number | undefined): string {
  if (floor === undefined) return pct(m);
  const under = m.total > 0 && (100 * m.covered) / m.total < floor;
  return `${pct(m)} / ${floor}%${under ? ' ❌' : ''}`;
}

async function coverageSection(): Promise<string> {
  const summary = await readJson<Record<string, FileCoverage>>('coverage/coverage-summary.json');
  if (!summary) return '_No coverage report; run `pnpm test:coverage` first._';
  const thresholds = vitestConfig.test?.coverage?.thresholds ?? {};
  const floors = floorsByPackage(thresholds);
  const row = (name: string, c: FileCoverage, floor: Floors = {}) =>
    `| ${name} | ${METRICS.map((m) => coverageCell(c[m], floor[m])).join(' | ')} |`;
  return [
    'Each cell is the measured coverage / the floor CI holds the package to.',
    '',
    '| Package | Lines | Statements | Functions | Branches |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...coverageByPackage(summary).map(([n, c]) => row(n, c, floors.get(n))),
    row('**All**', summary.total ?? emptyCoverage()),
    '',
    'The app is mostly covered by the e2e suite, which this does not count.',
  ].join('\n');
}

interface TestFile {
  name: string;
  assertionResults: { status: string }[];
}

interface TestCount {
  files: number;
  passed: number;
  failed: number;
  skipped: number;
}

/** Counts test files and tests per package (`scripts` for the repo's own scripts), by name. */
export function testsByPackage(files: TestFile[]): [string, TestCount][] {
  const byPackage = new Map<string, TestCount>();
  for (const file of files) {
    const name = packageOf(file.name) ?? 'scripts';
    const count = byPackage.get(name) ?? { files: 0, passed: 0, failed: 0, skipped: 0 };
    byPackage.set(name, count);
    count.files += 1;
    for (const { status } of file.assertionResults) {
      if (status === 'passed') count.passed += 1;
      else if (status === 'failed') count.failed += 1;
      else count.skipped += 1;
    }
  }
  return [...byPackage].sort(([a], [b]) => a.localeCompare(b));
}

async function testsSection(): Promise<string> {
  const report = await readJson<{ testResults: TestFile[] }>('.reports/vitest/results.json');
  if (!report) return '_No test report; run `pnpm test` first._';
  const rows = testsByPackage(report.testResults);
  const total = rows.reduce<TestCount>(
    (sum, [, c]) => ({
      files: sum.files + c.files,
      passed: sum.passed + c.passed,
      failed: sum.failed + c.failed,
      skipped: sum.skipped + c.skipped,
    }),
    { files: 0, passed: 0, failed: 0, skipped: 0 },
  );
  const row = (name: string, c: TestCount) =>
    `| ${name} | ${c.files} | ${c.passed + c.failed + c.skipped} | ${c.passed} | ${c.failed} | ${c.skipped} |`;
  return [
    '| Package | Test files | Tests | Passed | Failed | Skipped |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(([n, c]) => row(n, c)),
    row('**All**', total),
    '',
    'Unit tests only; the e2e job lists its browser tests on its own summary.',
  ].join('\n');
}

interface ComplexFunction {
  score: number;
  where: string;
}

/** An ESLint that reports every function's cognitive complexity, whatever its score. */
export function complexityLinter() {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['**/node_modules/**', '**/dist/**'] },
      {
        files: ['packages/*/src/**/*.{ts,tsx}'],
        languageOptions: { parser: tseslint.parser },
        plugins: { sonarjs },
        rules: { 'sonarjs/cognitive-complexity': ['warn', 0] },
      },
    ],
  });
}

/**
 * Reads the scores from complexityLinter's results. The rule only reports a score in its
 * message ("... from 23 to the 0 allowed"), so this throws on a parse error or on a message
 * it cannot read; quality-summary.test.ts shows a sonarjs upgrade that rewords it. That is
 * also why package.json pins eslint-plugin-sonarjs to an exact version.
 */
export function readScores(results: ESLint.LintResult[]): ComplexFunction[] {
  return results.flatMap((result) =>
    result.messages.map((m) => {
      const score = /from (\d+) to/.exec(m.message)?.[1];
      if (m.ruleId !== 'sonarjs/cognitive-complexity' || !score) {
        throw new Error(`Unexpected ESLint message in ${result.filePath}: ${m.message}`);
      }
      return { score: Number(score), where: `${path.relative(root, result.filePath)}:${m.line}` };
    }),
  );
}

async function complexFunctions(): Promise<ComplexFunction[]> {
  return readScores(await complexityLinter().lintFiles(['packages/*/src/**/*.{ts,tsx}']));
}

async function complexitySection(): Promise<string> {
  const functions = (await complexFunctions()).sort((a, b) => b.score - a.score);
  const over = functions.filter((f) => f.score > COGNITIVE_COMPLEXITY_LIMIT).length;
  return [
    `${over} of ${functions.length} functions are over the cognitive complexity limit of ${COGNITIVE_COMPLEXITY_LIMIT}.`,
    '',
    '| Cognitive complexity | Function |',
    '| ---: | --- |',
    ...functions.slice(0, TOP_FUNCTIONS).map((f) => `| ${f.score} | \`${f.where}\` |`),
  ].join('\n');
}

async function duplicationSection(): Promise<string> {
  const report = await readJson<{ statistics: { total: Record<string, number> } }>(
    '.reports/jscpd/jscpd-report.json',
  );
  if (!report) return '_No duplication report; run `pnpm lint:dupes` first._';
  const t = report.statistics.total;
  return `${t.clones} clones, ${t.duplicatedLines} of ${t.lines} lines duplicated (${t.percentage}%).`;
}

const sections: [string, () => Promise<string>][] = [
  ['Unit tests', testsSection],
  ['Test coverage', coverageSection],
  ['Most complex functions', complexitySection],
  ['Duplication', duplicationSection],
];

async function main() {
  const parts = ['## Code quality'];
  for (const [title, section] of sections) parts.push(`### ${title}`, await section());
  const markdown = parts.join('\n\n') + '\n';
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

// Run only as a script, so tests can import the functions above.
if (path.resolve(process.argv[1] ?? '') === import.meta.filename) await main();
