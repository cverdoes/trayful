import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // A floor per package, so a well-tested package cannot hide one with no tests. When a
      // run beats a floor, Vitest raises it in this file (to the whole percent below); commit
      // that change. The app's components are covered by the e2e suite instead.
      thresholds: {
        autoUpdate: (next) => Math.floor(next),
        'packages/core/src/**': { statements: 89, branches: 80, functions: 94, lines: 91 },
        'packages/formats/src/**': { statements: 86, branches: 76, functions: 90, lines: 89 },
        'packages/server/src/**': { statements: 86, branches: 72, functions: 86, lines: 87 },
        'packages/cli/src/**': { statements: 43, branches: 39, functions: 48, lines: 44 },
        'packages/app/src/**': { statements: 0, branches: 0, functions: 0, lines: 0 },
      },
    },
  },
});
