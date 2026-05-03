// ESLint flat config — required by ESLint 10.x.
// Mirrors the rules ObsidianReviewBot enforces on every community-plugin
// submission PR. See:
//   context-v/plans/2026-05-03_Assuring-Obsidian-Community-Plugin-Requirements.md
//   ../cite-wide/context-v/reminders/Obsidian-Type-Safety.md
//
// All rules below are blocking under the bot. Do not downgrade to "warn"
// without removing the corresponding violations from the codebase first.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
    {
        // Project-wide ignores. Build outputs, build tooling, and node_modules.
        // (Replaces the now-unsupported .eslintignore file.)
        ignores: [
            'node_modules/**',
            'main.js',
            'styles.css',
            'esbuild.config.mjs',
            'version-bump.mjs',
            'setup-plugin.mjs',
            'scripts/**',
            'eslint.config.mjs', // self-exclude
        ],
    },
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                // Type-aware linting requires this. no-floating-promises,
                // no-base-to-string, and no-unnecessary-type-assertion all
                // need it to function.
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // === ObsidianReviewBot hard rules ===
            // Violation = automatic submission rejection. No appeal.
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-base-to-string': 'error',

            // === Local hygiene ===
            'no-unused-vars': 'off', // typescript-eslint's version handles this with TS awareness
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none' }],
            '@typescript-eslint/consistent-type-imports': 'error',

            // === Intentionally relaxed (carried over from .eslintrc) ===
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
];
