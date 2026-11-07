import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    // The JSON report gives `pnpm quality:summary` the test counts per package.
    reporters: ['default', 'json'],
    outputFile: { json: '.reports/vitest/results.json' },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      // React components are covered by the e2e suite, which this report cannot count, so
      // leaving them in would only drag the numbers down. The floors guard the plain modules.
      exclude: ['packages/app/src/**/*.tsx'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // A floor per package, so a well-tested package cannot hide one with no tests. A
      // coverage run raises a floor when tests land, to 2 points under what it measured: some
      // cli code paths run only on some machines, so a local run can read about a point higher
      // than CI. A floor never drops on its own.
      thresholds: {
        autoUpdate: (measured, previous) => Math.max(previous, Math.floor(measured) - 2),
        'packages/core/src/**': { statements: 95, branches: 90, functions: 97, lines: 96 },
        'packages/formats/src/**': { statements: 95, branches: 93, functions: 97, lines: 96 },
        'packages/server/src/**': { statements: 91, branches: 81, functions: 94, lines: 93 },
        'packages/cli/src/**': { statements: 92, branches: 88, functions: 85, lines: 94 },
        'packages/engine-client/src/**': { statements: 92, branches: 86, functions: 88, lines: 95 },
        'packages/app/src/**': { statements: 79, branches: 77, functions: 78, lines: 80 },
      },
    },
  },
});
