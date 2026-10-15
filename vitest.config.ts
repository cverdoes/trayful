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
        'packages/core/src/**': { statements: 94, branches: 87, functions: 96, lines: 95 },
        'packages/formats/src/**': { statements: 92, branches: 87, functions: 96, lines: 93 },
        'packages/server/src/**': { statements: 90, branches: 78, functions: 92, lines: 91 },
        'packages/cli/src/**': { statements: 92, branches: 87, functions: 84, lines: 94 },
        // Only the app's plain modules have unit tests; this floor guards those, not the app.
        'packages/app/src/**': { statements: 20, branches: 23, functions: 20, lines: 21 },
      },
    },
  },
});
