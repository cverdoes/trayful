import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // A floor per package, so a well-tested package cannot hide one with no tests. A
      // coverage run raises a floor when tests land, to 2 points under what it measured: some
      // cli code paths run only on some machines, so a local run can read about a point higher
      // than CI. A floor never drops on its own. The app's components are covered by the e2e
      // suite instead.
      thresholds: {
        autoUpdate: (measured, previous) => Math.max(previous, Math.floor(measured) - 2),
        'packages/core/src/**': { statements: 95, branches: 90, functions: 97, lines: 96 },
        'packages/formats/src/**': { statements: 95, branches: 93, functions: 97, lines: 96 },
        'packages/server/src/**': { statements: 91, branches: 81, functions: 94, lines: 93 },
        'packages/cli/src/**': { statements: 92, branches: 88, functions: 85, lines: 94 },
        // Only the app's plain modules have unit tests; this floor guards those, not the app.
        'packages/app/src/**': { statements: 33, branches: 36, functions: 25, lines: 33 },
      },
    },
  },
});
