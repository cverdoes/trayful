/**
 * Prints a Markdown summary of the e2e run: how many browser tests each spec file has and how
 * they ended. In GitHub Actions it also appends the summary to the run's page
 * ($GITHUB_STEP_SUMMARY).
 *
 * Run after `pnpm test:e2e`, whose JSON reporter writes the report it reads.
 */
import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const REPORT = 'test-results/e2e.json';

interface Spec {
  ok: boolean;
  tests: { status: string }[];
}

export interface Suite {
  file: string;
  specs?: Spec[];
  suites?: Suite[];
}

interface SpecCount {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
}

const specsIn = (suite: Suite): Spec[] => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(specsIn),
];

/**
 * Counts the tests in each spec file. A test is skipped when every run of it was skipped,
 * passed when its last run was fine (a flaky retry counts as passed) and failed otherwise.
 */
export function testsBySpecFile(suites: Suite[]): [string, SpecCount][] {
  return suites
    .map((suite): [string, SpecCount] => {
      const count = { tests: 0, passed: 0, failed: 0, skipped: 0 };
      for (const spec of specsIn(suite)) {
        count.tests += 1;
        if (spec.tests.every((t) => t.status === 'skipped')) count.skipped += 1;
        else if (spec.ok) count.passed += 1;
        else count.failed += 1;
      }
      return [suite.file, count];
    })
    .sort(([a], [b]) => a.localeCompare(b));
}

async function summary(): Promise<string> {
  let suites: Suite[];
  try {
    const report = JSON.parse(await readFile(path.join(root, REPORT), 'utf8')) as {
      suites: Suite[];
    };
    suites = report.suites;
  } catch {
    return '_No e2e report; run `pnpm test:e2e` first._';
  }
  const rows = testsBySpecFile(suites);
  const row = (name: string, c: SpecCount) =>
    `| ${name} | ${c.tests} | ${c.passed} | ${c.failed} | ${c.skipped} |`;
  const total = { tests: 0, passed: 0, failed: 0, skipped: 0 };
  for (const [, c] of rows) {
    total.tests += c.tests;
    total.passed += c.passed;
    total.failed += c.failed;
    total.skipped += c.skipped;
  }
  return [
    '| Spec file | Tests | Passed | Failed | Skipped |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...rows.map(([n, c]) => row(n, c)),
    row('**All**', total),
  ].join('\n');
}

async function main() {
  const markdown = `## End-to-end tests\n\n${await summary()}\n`;
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}

// Run only as a script, so tests can import the functions above.
if (path.resolve(process.argv[1] ?? '') === import.meta.filename) await main();
