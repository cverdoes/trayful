import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'html'],
      // A floor just under today's numbers, so coverage can only go up. Raise it as tests land.
      thresholds: { statements: 60, branches: 50, functions: 57, lines: 62 },
    },
  },
});
