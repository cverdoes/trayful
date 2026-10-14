import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

// Also read by scripts/quality-summary.ts, so the CI summary reports against the same limit.
export const COGNITIVE_COMPLEXITY_LIMIT = 15;

// Existing violations are recorded in eslint-suppressions.json, so CI fails only on new ones.
// After fixing some, run `pnpm lint:prune` to shrink the file. Never add to it by hand.
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'packages/formats/schema/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // noUncheckedIndexedAccess makes `!` the honest way to say "this index exists".
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      'sonarjs/no-nested-template-literals': 'off',
      // Security hotspots meant for human review, not build failures. Seeded RNG and
      // loopback addresses are deliberate here.
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-os-command-from-path': 'off',

      // Size and complexity limits.
      'sonarjs/cognitive-complexity': ['error', COGNITIVE_COMPLEXITY_LIMIT],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.test.ts', 'e2e/**'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable' } },
  },
);
