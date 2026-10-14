/**
 * Prints a Markdown summary of the code quality numbers: coverage per package, the most
 * complex functions, duplication and the lint backlog in eslint-suppressions.json.
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

const root = path.resolve(import.meta.dirname, '..');
const TOP_FUNCTIONS = 10;
const TOP_RULES = 10;

interface Metric {
  total: number;
  covered: number;
}
type FileCoverage = Record<'lines' | 'statements' | 'functions' | 'branches', Metric>;
type Suppressions = Record<string, Record<string, { count: number }>>;

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

/** Adds up per-file coverage into one entry per workspace package, sorted by name. */
export function coverageByPackage(summary: Record<string, FileCoverage>) {
  const byPackage = new Map<string, FileCoverage>();
  for (const [file, coverage] of Object.entries(summary)) {
    const name = /packages\/([^/]+)\//.exec(file)?.[1];
    if (!name) continue;
    const total = byPackage.get(name) ?? emptyCoverage();
    byPackage.set(name, total);
    addMetrics(total, coverage);
  }
  return [...byPackage].sort(([a], [b]) => a.localeCompare(b));
}

async function coverageSection(): Promise<string> {
  const summary = await readJson<Record<string, FileCoverage>>('coverage/coverage-summary.json');
  if (!summary) return '_No coverage report; run `pnpm test:coverage` first._';
  const row = (name: string, c: FileCoverage) =>
    `| ${name} | ${pct(c.lines)} | ${pct(c.statements)} | ${pct(c.functions)} | ${pct(c.branches)} |`;
  return [
    '| Package | Lines | Statements | Functions | Branches |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...coverageByPackage(summary).map(([n, c]) => row(n, c)),
    row('**All**', summary.total ?? emptyCoverage()),
    '',
    'The app is mostly covered by the e2e suite, which this does not count.',
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
      { ignores: ['**/node_modules/**', '**/dist/**', '**/*.test.ts'] },
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

/** Counts suppressed violations per rule, most common first. */
export function backlogByRule(suppressions: Suppressions): [string, number][] {
  const byRule = new Map<string, number>();
  for (const rules of Object.values(suppressions)) {
    for (const [rule, { count }] of Object.entries(rules)) {
      byRule.set(rule, (byRule.get(rule) ?? 0) + count);
    }
  }
  return [...byRule].sort((a, b) => b[1] - a[1]);
}

async function backlogSection(): Promise<string> {
  const suppressions = (await readJson<Suppressions>('eslint-suppressions.json')) ?? {};
  const byRule = backlogByRule(suppressions);
  const total = byRule.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return 'No baselined lint violations left.';
  return [
    `${total} baselined violations in ${Object.keys(suppressions).length} files. Fix them, then run \`pnpm lint:prune\`.`,
    '',
    '| Rule | Count |',
    '| --- | ---: |',
    ...byRule.slice(0, TOP_RULES).map(([rule, n]) => `| \`${rule}\` | ${n} |`),
  ].join('\n');
}

const sections: [string, () => Promise<string>][] = [
  ['Test coverage', coverageSection],
  ['Most complex functions', complexitySection],
  ['Duplication', duplicationSection],
  ['Lint backlog', backlogSection],
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
